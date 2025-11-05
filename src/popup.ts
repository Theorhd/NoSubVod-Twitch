declare const chrome: any;

import { storage, VodDownload, Settings, ActiveDownload } from './storage';
import { badgeManager, Badge, PRESET_BADGES } from './badge-manager';

// Util: current active tab URL
async function getActiveTabUrl(): Promise<string | null> {
  return new Promise((resolve) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs: any[]) => {
      resolve(tabs[0]?.url ?? null);
    });
  });
}

function extractVodId(url: string): string | null {
  try {
    const u = new URL(url);
    const m = u.pathname.match(/\/videos\/(\d+)/);
    return m ? m[1] : null;
  } catch {
    return null;
  }
}

async function fetchTwitchVideo(vodID: string): Promise<any> {
  const resp = await fetch('https://gql.twitch.tv/gql', {
    method: 'POST',
    body: JSON.stringify({
      query: `query { video(id: "${vodID}") { id title broadcastType createdAt lengthSeconds owner { login displayName } seekPreviewsURL previewThumbnailURL(width: 320 height: 180) } }`
    }),
    headers: {
      'Client-Id': 'kimne78kx3ncx6brgo4mv6wki5h1ko',
      'Accept': 'application/json',
      'Content-Type': 'application/json'
    }
  });
  return resp.json();
}

function getThumbnailUrl(vodId: string, width: number = 320, height: number = 180): string {
  // Generate Twitch thumbnail URL pattern
  return `https://static-cdn.jtvnw.net/cf_vods/${vodId}/thumb/thumb0-${width}x${height}.jpg`;
}

function buildStreamUrl(domain: string, vodSpecialID: string, resKey: string, vodId: string, channelLogin: string, broadcastType: string, createdAt: string): string {
  const now = new Date();
  const created = new Date(createdAt);
  const daysDiff = (now.getTime() - created.getTime()) / 86400000;
  broadcastType = broadcastType.toLowerCase();

  if (broadcastType === 'highlight') {
    return `https://${domain}/${vodSpecialID}/${resKey}/highlight-${vodId}.m3u8`;
  }
  if (broadcastType === 'upload' && daysDiff > 7) {
    return `https://${domain}/${channelLogin}/${vodId}/${vodSpecialID}/${resKey}/index-dvr.m3u8`;
  }
  return `https://${domain}/${vodSpecialID}/${resKey}/index-dvr.m3u8`;
}

async function probeQuality(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, { method: 'GET' });
    if (!res.ok) return false;
    const txt = await res.text();
    return txt.includes('.m3u8') || txt.includes('.ts') || txt.includes('.mp4');
  } catch {
    return false;
  }
}

function createOption(value: string, label: string): HTMLOptionElement {
  const opt = document.createElement('option');
  opt.value = value;
  opt.textContent = label;
  return opt;
}

function showNotification(title: string, message: string, iconUrl = chrome.runtime.getURL('assets/icons/icon.png')): void {
  storage.getSettings().then(settings => {
    if (settings.enableNotifications) {
      chrome.notifications.create({
        type: 'basic',
        iconUrl,
        title,
        message
      });
    }
  });
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}

function formatTime(seconds: number): string {
  if (!isFinite(seconds)) return '—';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}
// Convertit une chaîne hh:mm:ss en secondes
function parseTime(str: string): number | null {
  const parts = str.split(':').map(p => parseInt(p, 10));
  if (parts.some(isNaN)) return null;
  if (parts.length === 3) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  }
  if (parts.length === 2) {
    return parts[0] * 60 + parts[1];
  }
  if (parts.length === 1) {
    return parts[0];
  }
  return null;
}

class ProgressTracker {
  private startTime: number = 0;
  private downloadedBytes: number = 0;
  private lastUpdateTime: number = 0;
  private lastDownloadedBytes: number = 0;

  start(): void {
    this.startTime = Date.now();
    this.lastUpdateTime = this.startTime;
    this.downloadedBytes = 0;
    this.lastDownloadedBytes = 0;
  }

  update(current: number, total: number, segmentSize: number) {
    this.downloadedBytes += segmentSize;
    const now = Date.now();
    const elapsed = (now - this.startTime) / 1000;
    const timeSinceLastUpdate = (now - this.lastUpdateTime) / 1000;
    
    const percent = Math.round((current / total) * 100);
    const speed = timeSinceLastUpdate > 0 ? (segmentSize / timeSinceLastUpdate) : 0;
    const avgSpeed = elapsed > 0 ? (this.downloadedBytes / elapsed) : 0;
    const remaining = avgSpeed > 0 ? ((total - current) * (this.downloadedBytes / current)) / avgSpeed : 0;
    
    this.lastUpdateTime = now;
    this.lastDownloadedBytes = this.downloadedBytes;

    return {
      percent,
      current,
      total,
      speed,
      remaining,
      downloadedBytes: this.downloadedBytes
    };
  }
}

function setupTabs(): void {
  const tabs = document.querySelectorAll('.tab');
  const tabContents = document.querySelectorAll('.tab-content');

  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const tabName = (tab as HTMLElement).dataset.tab;
      
      tabs.forEach(t => t.classList.remove('active'));
      tabContents.forEach(tc => tc.classList.remove('active'));
      
      tab.classList.add('active');
      document.getElementById(`${tabName}-tab`)?.classList.add('active');
      
      if (tabName === 'history') {
        loadHistory();
      } else if (tabName === 'settings') {
        loadSettings();
      }
    });
  });
}

async function loadHistory(): Promise<void> {
  const historyList = document.getElementById('historyList')!;
  const clearBtn = document.getElementById('clearHistory')!;
  const history = await storage.getHistory();
  const settings = await storage.getSettings();

  if (history.length === 0) {
    historyList.innerHTML = `
      <div class="history-empty">
        <p>📦 Aucun téléchargement pour le moment</p>
        <p class="muted" style="font-size: 11px;">Vos téléchargements apparaîtront ici</p>
      </div>
    `;
    clearBtn.style.display = 'none';
    return;
  }

  clearBtn.style.display = 'block';
  historyList.innerHTML = history.map(item => {
    const date = new Date(item.downloadDate).toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
    const status = item.success ? '✅' : '❌';
    const failedInfo = item.failedSegments > 0 ? ` (${item.failedSegments} segments omis)` : '';

    return `
      <div class="history-item">
        <div class="history-header">
          ${settings.showThumbnails && item.thumbnail ? `<img src="${item.thumbnail}" class="history-thumb" alt="thumbnail">` : ''}
          <div class="history-info">
            <div class="history-title">${status} ${item.title}</div>
            <div class="history-meta">
              ${item.channel} • ${item.quality} • ${formatBytes(item.fileSize)}${failedInfo}
            </div>
            <div class="history-meta">${date}</div>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

async function clearHistory(): Promise<void> {
  if (confirm('Êtes-vous sûr de vouloir effacer l\'historique ?')) {
    await storage.clearHistory();
    loadHistory();
  }
}

async function loadSettings(): Promise<void> {
  const settings = await storage.getSettings();

  (document.getElementById('settingDefaultQuality') as HTMLSelectElement).value = settings.defaultQuality;
  (document.getElementById('settingChunkSize') as HTMLInputElement).value = settings.downloadChunkSize.toString();
  (document.getElementById('settingNotifications') as HTMLInputElement).checked = settings.enableNotifications;
  (document.getElementById('settingThumbnails') as HTMLInputElement).checked = settings.showThumbnails;
  (document.getElementById('settingMaxHistory') as HTMLInputElement).value = settings.maxHistoryItems.toString();
  (document.getElementById('settingAutoCleanup') as HTMLInputElement).value = settings.autoCleanupDays.toString();
  (document.getElementById('settingDeveloperMode') as HTMLInputElement).checked = settings.developerMode;
}

async function saveSettings(): Promise<void> {
  const settings: Partial<Settings> = {
    defaultQuality: (document.getElementById('settingDefaultQuality') as HTMLSelectElement).value,
    downloadChunkSize: parseInt((document.getElementById('settingChunkSize') as HTMLInputElement).value),
    enableNotifications: (document.getElementById('settingNotifications') as HTMLInputElement).checked,
    showThumbnails: (document.getElementById('settingThumbnails') as HTMLInputElement).checked,
    maxHistoryItems: parseInt((document.getElementById('settingMaxHistory') as HTMLInputElement).value),
    autoCleanupDays: parseInt((document.getElementById('settingAutoCleanup') as HTMLInputElement).value),
    developerMode: (document.getElementById('settingDeveloperMode') as HTMLInputElement).checked
  };

  await storage.saveSettings(settings);

  const successEl = document.getElementById('settingsSuccess')!;
  successEl.textContent = '✅ Paramètres enregistrés !';
  setTimeout(() => {
    successEl.textContent = '';
  }, 3000);
}

async function downloadVod(playlistUrl: string, vodInfo: any, qualityLabel: string): Promise<void> {
  const progressContainer = document.getElementById('progressContainer')!;
  const progressFill = document.getElementById('progressFill')!;
  const progressPercent = document.getElementById('progressPercent')!;
  const progressSegments = document.getElementById('progressSegments')!;
  const progressSpeed = document.getElementById('progressSpeed')!;
  const progressTime = document.getElementById('progressTime')!;
  const progressSize = document.getElementById('progressSize')!;
  const status = document.getElementById('status')!;
  const error = document.getElementById('error')!;
  const success = document.getElementById('success')!;
  const btn = document.getElementById('downloadBtn') as HTMLButtonElement;
  const startTimeInput = document.getElementById('startTime') as HTMLInputElement;
  const endTimeInput = document.getElementById('endTime') as HTMLInputElement;

  error.textContent = '';
  success.textContent = '';
  status.textContent = 'Démarrage du téléchargement...';
  progressContainer.classList.add('visible');
  btn.disabled = true;

  try {
    // Send download request to background script
    chrome.runtime.sendMessage(
      {
        action: 'download',
        playlistUrl,
        vodInfo,
        qualityLabel,
        clipStart: parseTime(startTimeInput.value) ?? 0,
        clipEnd: parseTime(endTimeInput.value) ?? Infinity
      },
      (response: any) => {
        if (chrome.runtime.lastError) {
          error.textContent = '❌ Erreur: ' + chrome.runtime.lastError.message;
          progressContainer.classList.remove('visible');
          btn.disabled = false;
          return;
        }

        if (response.success) {
          const msg = response.failedCount > 0
            ? `✅ Téléchargement terminé (${response.failedCount} segments omis)`
            : '✅ Téléchargement terminé avec succès !';
          success.textContent = msg;

          setTimeout(() => {
            progressContainer.classList.remove('visible');
            success.textContent = '';
          }, 5000);
        } else {
          error.textContent = '❌ Échec: ' + response.error;
          progressContainer.classList.remove('visible');
        }
        btn.disabled = false;
      }
    );

    // Show message that download continues in background
    status.textContent = '⏳ Téléchargement en cours en arrière-plan...';
    success.textContent = '💡 Vous pouvez fermer ce popup, le téléchargement continuera !';
  } catch (e: any) {
    console.error('[NoSubVod] Download error:', e);
    error.textContent = '❌ Échec: ' + (e.message || e);
    progressContainer.classList.remove('visible');
    btn.disabled = false;
  }
}

async function init(): Promise<void> {
  setupTabs();
  
  const progressContainer = document.getElementById('progressContainer')!;
  const progressFill = document.getElementById('progressFill')!;
  const progressPercent = document.getElementById('progressPercent')!;
  const progressSegments = document.getElementById('progressSegments')!;
  const progressSpeed = document.getElementById('progressSpeed')!;
  const progressSize = document.getElementById('progressSize')!;
  const cancelBtn = document.getElementById('cancelDownload')! as HTMLButtonElement;
  const pauseBtn = document.getElementById('pauseDownload')! as HTMLButtonElement;
  const resumeBtn = document.getElementById('resumeDownload')! as HTMLButtonElement;
  const successEl = document.getElementById('success')!;
  const errorEl = document.getElementById('error')!;
  const statusEl = document.getElementById('status')!;
  
  // Restore active download state if exists
  const activeDownload = await storage.getActiveDownload();
  if (activeDownload) {
    progressContainer.classList.add('visible');
    const progress = activeDownload.progress;
    progressFill.style.width = `${progress.percent}%`;
    progressPercent.textContent = `${progress.percent}%`;
    progressSegments.textContent = `${progress.current}/${progress.total}`;
    progressSpeed.textContent = `${formatBytes(progress.speed)}/s`;
    progressSize.textContent = formatBytes(progress.downloadedBytes);
    statusEl.textContent = '⏳ Téléchargement en cours...';
    successEl.textContent = '💡 Le téléchargement continue en arrière-plan';
  }
  
  // Listen for download progress updates from background
  chrome.runtime.onMessage.addListener((request: any, sender: any, sendResponse: (response: any) => void) => {
    if (request.action === 'downloadProgress') {
      if (progressFill && progressPercent && progressSegments && progressSpeed && progressSize) {
        const progress = request.progress;
        progressFill.style.width = `${progress.percent}%`;
        progressPercent.textContent = `${progress.percent}%`;
        progressSegments.textContent = `${progress.current}/${progress.total}`;
        progressSpeed.textContent = `${formatBytes(progress.speed)}/s`;
        progressSize.textContent = formatBytes(progress.downloadedBytes);
      }
    }
    
    if (request.action === 'downloadComplete') {
      progressContainer.classList.remove('visible');
      if (request.success) {
        const msg = request.failedCount > 0
          ? `✅ Téléchargement terminé (${request.failedCount} segments omis)`
          : '✅ Téléchargement terminé avec succès !';
        successEl.textContent = msg;
        setTimeout(() => { successEl.textContent = ''; }, 5000);
      } else {
        errorEl.textContent = '❌ Échec: ' + request.error;
      }
    }
    
    // Handle blob download request from background (since URL.createObjectURL doesn't work in service workers)
    if (request.action === 'createBlobDownload') {
      console.log('[NoSubVod Popup] Creating blob download from storage...', request);
      
      (async () => {
        try {
          // Small delay to ensure storage write is complete
          await new Promise(resolve => setTimeout(resolve, 100));
          
          // Retrieve data from chrome.storage.local
          console.log('[NoSubVod Popup] Retrieving data from storage key:', request.storageKey);
          const result = await new Promise<any>((resolve, reject) => {
            chrome.storage.local.get([request.storageKey], (data: any) => {
              if (chrome.runtime.lastError) {
                console.error('[NoSubVod Popup] Storage retrieval error:', chrome.runtime.lastError);
                reject(chrome.runtime.lastError);
              } else {
                console.log('[NoSubVod Popup] Storage data retrieved:', Object.keys(data));
                resolve(data);
              }
            });
          });
          
          const downloadData = result[request.storageKey];
          if (!downloadData) {
            console.error('[NoSubVod Popup] Storage key not found:', request.storageKey);
            console.error('[NoSubVod Popup] Available keys:', Object.keys(result));
            throw new Error('No data found in storage');
          }
          
          if (!downloadData.base64Segments || !Array.isArray(downloadData.base64Segments)) {
            console.error('[NoSubVod Popup] Invalid data structure:', downloadData);
            throw new Error('Invalid data structure in storage');
          }
          
          console.log('[NoSubVod Popup] Converting', downloadData.base64Segments.length, 'base64 segments to buffers...');
          
          // Convert base64 strings back to ArrayBuffers
          const arrayBuffers = downloadData.base64Segments.map((base64: string) => {
            const binary = atob(base64);
            const bytes = new Uint8Array(binary.length);
            for (let i = 0; i < binary.length; i++) {
              bytes[i] = binary.charCodeAt(i);
            }
            return bytes.buffer;
          });
          
          console.log('[NoSubVod Popup] Creating blob from', arrayBuffers.length, 'buffers...');
          // Create blob from buffers
          const blob = new Blob(arrayBuffers, { type: 'video/mp2t' });
          console.log('[NoSubVod Popup] Blob created, size:', blob.size);
          const blobUrl = URL.createObjectURL(blob);
          
          // Clean up storage
          chrome.storage.local.remove([request.storageKey], () => {
            console.log('[NoSubVod Popup] Storage cleaned up');
          });
          
          // Trigger download
          chrome.downloads.download({
            url: blobUrl,
            filename: `twitch_vod_${downloadData.vodInfo.id}.ts`,
            saveAs: true
          }, (chromeDownloadId: number) => {
            // Revoke blob URL after a delay
            setTimeout(() => {
              URL.revokeObjectURL(blobUrl);
              console.log('[NoSubVod Popup] Blob URL revoked');
            }, 1000);
            
            if (chrome.runtime.lastError) {
              console.error('[NoSubVod Popup] Download error:', chrome.runtime.lastError);
              sendResponse({ success: false, error: chrome.runtime.lastError.message });
            } else {
              console.log('[NoSubVod Popup] Download started with ID:', chromeDownloadId);
              sendResponse({ success: true, chromeDownloadId });
            }
          });
        } catch (e: any) {
          console.error('[NoSubVod Popup] Blob creation error:', e);
          sendResponse({ success: false, error: e.message || 'Erreur de création du blob' });
        }
      })();
      
      return true; // Keep message channel open for async response
    }
  });
  
  // Cancel download button
  cancelBtn.addEventListener('click', async () => {
    const activeDownload = await storage.getActiveDownload();
    if (activeDownload) {
      chrome.runtime.sendMessage({
        action: 'cancelDownload',
        downloadId: activeDownload.downloadId
      }, (response: any) => {
        if (response && response.success) {
          progressContainer.classList.remove('visible');
          successEl.textContent = '⚠️ Téléchargement annulé';
          setTimeout(() => { successEl.textContent = ''; }, 3000);
        }
      });
    }
  });
  
  // Pause download button
  pauseBtn.addEventListener('click', async () => {
    const activeDownload = await storage.getActiveDownload();
    if (activeDownload) {
      chrome.runtime.sendMessage({
        action: 'pauseDownload',
        downloadId: activeDownload.downloadId
      }, (response: any) => {
        if (response && response.success) {
          pauseBtn.style.display = 'none';
          resumeBtn.style.display = 'block';
          statusEl.textContent = '⏸️ Téléchargement en pause...';
        }
      });
    }
  });
  
  // Resume download button
  resumeBtn.addEventListener('click', async () => {
    const activeDownload = await storage.getActiveDownload();
    if (activeDownload) {
      chrome.runtime.sendMessage({
        action: 'resumeDownload',
        downloadId: activeDownload.downloadId
      }, (response: any) => {
        if (response && response.success) {
          resumeBtn.style.display = 'none';
          pauseBtn.style.display = 'block';
          statusEl.textContent = '▶️ Reprise du téléchargement...';
        }
      });
    }
  });
  
  const status = document.getElementById('status')!;
  const content = document.getElementById('content')! as HTMLDivElement;
  const error = document.getElementById('error')!;
  const channelEl = document.getElementById('channel')!;
  const titleEl = document.getElementById('title')!;
  const typeEl = document.getElementById('type')!;
  const createdEl = document.getElementById('created')!;
  const vodEl = document.getElementById('vodId')!;
  const qualitySel = document.getElementById('quality')! as HTMLSelectElement;
  const btn = document.getElementById('downloadBtn')! as HTMLButtonElement;
  const customUrl = document.getElementById('customUrl')! as HTMLInputElement;
  const btnDirect = document.getElementById('downloadDirect')! as HTMLButtonElement;
  const thumbnailEl = document.getElementById('thumbnail')! as HTMLImageElement;
  const clearHistoryBtn = document.getElementById('clearHistory')!;
  const saveSettingsBtn = document.getElementById('saveSettings')!;
  
  clearHistoryBtn.addEventListener('click', clearHistory);
  saveSettingsBtn.addEventListener('click', saveSettings);
  
  const tabUrl = await getActiveTabUrl();
  if (!tabUrl) {
    status.textContent = "Aucun onglet actif.";
    return;
  }

  const vodId = extractVodId(tabUrl);
  if (!vodId) {
    status.textContent = "Ouvrez une VOD Twitch (url /videos/<id>).";
    return;
  }
  vodEl.textContent = vodId;

  try {
    const gql = await fetchTwitchVideo(vodId);
    const video = gql?.data?.video;
    if (!video) throw new Error('Aucune info renvoyée.');

    channelEl.textContent = video.owner?.displayName ?? video.owner?.login ?? '—';
    titleEl.textContent = video.title ?? '—';
    typeEl.textContent = video.broadcastType ?? '—';
    createdEl.textContent = new Date(video.createdAt).toLocaleString();
    
    const settings = await storage.getSettings();
    if (settings.showThumbnails) {
      // Try previewThumbnailURL first, fallback to generated URL
      const thumbnailUrl = video.previewThumbnailURL || getThumbnailUrl(vodId);
      thumbnailEl.src = thumbnailUrl;
      thumbnailEl.classList.remove('hidden');
      
      // Fallback if image fails to load
      thumbnailEl.onerror = () => {
        console.log('[NoSubVod] Thumbnail failed to load, trying alternative...');
        if (thumbnailEl.src !== getThumbnailUrl(vodId)) {
          thumbnailEl.src = getThumbnailUrl(vodId);
        }
      };
    }

    const seekUrl = new URL(video.seekPreviewsURL);
    const domain = seekUrl.host;
    const paths = seekUrl.pathname.split('/');
    const vodSpecialID = paths[paths.findIndex((el) => el.includes('storyboards')) - 1];

    const resolutions: Record<string, { res: string; fps: number; label: string }> = {
      '160p30': { res: '284x160', fps: 30, label: '160p' },
      '360p30': { res: '640x360', fps: 30, label: '360p' },
      '480p30': { res: '854x480', fps: 30, label: '480p' },
      '720p60': { res: '1280x720', fps: 60, label: '720p60' },
      '1080p60': { res: '1920x1080', fps: 60, label: '1080p60' },
      'chunked': { res: '1920x1080', fps: 60, label: 'Source' }
    };
    const keys = Object.keys(resolutions).reverse();

    qualitySel.innerHTML = '';
    qualitySel.appendChild(createOption('', 'Choisir une qualité…'));

    const candidates: { key: string; url: string; label: string }[] = [];
    for (const key of keys) {
      const url = buildStreamUrl(domain, vodSpecialID, key, vodId, video.owner.login, video.broadcastType, video.createdAt);
      if (await probeQuality(url)) {
        const label = resolutions[key].label;
        candidates.push({ key, url, label });
        qualitySel.appendChild(createOption(url, `${label} (${resolutions[key].res})`));
      }
    }

    if (candidates.length === 0) {
      status.textContent = "Aucune qualité détectée (peut-être sub-only/privée).";
      return;
    }
    
    // Hide loading message and show content
    status.style.display = 'none';
    content.style.display = 'block';
    
    if (settings.defaultQuality && candidates.length > 0) {
      const defaultCandidate = candidates.find(c => c.label === settings.defaultQuality);
      if (defaultCandidate) {
        qualitySel.value = defaultCandidate.url;
        btn.disabled = false;
      }
    }

    qualitySel.addEventListener('change', () => {
      btn.disabled = !qualitySel.value;
    });

    btn.addEventListener('click', async () => {
      const playlistUrl = qualitySel.value;
      if (!playlistUrl) return;
      
      const selectedOption = qualitySel.options[qualitySel.selectedIndex];
      const qualityLabel = selectedOption.textContent || 'Unknown';
      
      await downloadVod(playlistUrl, video, qualityLabel);
    });

    btnDirect.addEventListener('click', async () => {
      const url = customUrl.value.trim();
      if (!url) return;
      
      const errorEl = document.getElementById('error')!;
      const successEl = document.getElementById('success')!;
      errorEl.textContent = '';
      successEl.textContent = '';
      
      if (url.endsWith('.m3u8')) {
        await downloadVod(url, { id: 'custom', title: 'Custom VOD', owner: { login: 'unknown' }, lengthSeconds: 0 }, 'Custom');
      } else {
        chrome.downloads.download({ url, saveAs: true }, () => {
          successEl.textContent = '✅ Téléchargement lancé !';
          setTimeout(() => { successEl.textContent = ''; }, 3000);
        });
      }
    });
  } catch (e: any) {
    status.textContent = '';
    error.textContent = '❌ Erreur: ' + (e?.message || e);
  }
}

// Badge Manager Handler
async function setupBadgeManager() {
  const badgePresetsContainer = document.getElementById('badgePresets') as HTMLElement;
  const badgeImportedContainer = document.getElementById('badgeImported') as HTMLElement;
  const badgeImportBtn = document.getElementById('badgeImportBtn') as HTMLButtonElement;
  const badgeFileInput = document.getElementById('badgeFileInput') as HTMLInputElement;
  const badgeInput = document.getElementById('chatMyBadge') as HTMLInputElement;
  const badgeNameInput = document.getElementById('chatBadgeName') as HTMLInputElement;

  let selectedBadge: Badge | null = null;

  // Fonction pour afficher un badge
  const createBadgeButton = (badge: Badge, container: HTMLElement, isSelected: boolean = false) => {
    const btn = document.createElement('button');
    btn.className = `badge-btn${isSelected ? ' selected' : ''}`;
    btn.type = 'button';
    
    if (badge.type === 'imported' && badge.content.startsWith('data:')) {
      // Image importée
      const img = document.createElement('img');
      img.src = badge.content;
      btn.appendChild(img);
    } else {
      // Emoji ou texte
      btn.textContent = badge.content;
    }

    btn.title = badge.name;
    
    btn.addEventListener('click', () => {
      // Désélectionner le précédent
      container.querySelectorAll('.badge-btn.selected').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      selectedBadge = badge;
      badgeInput.value = badge.content;
      badgeNameInput.value = badge.name; // Auto-fill le nom du badge
    });

    container.appendChild(btn);
  };

  // Charger les badges prédéfinis
  const badges = await badgeManager.getAllBadges();
  const presets = badges.filter(b => b.type !== 'imported');
  const imported = badges.filter(b => b.type === 'imported');

  presets.forEach(badge => {
    createBadgeButton(badge, badgePresetsContainer);
  });

  imported.forEach(badge => {
    createBadgeButton(badge, badgeImportedContainer);
  });

  // Gérer l'import de badges
  badgeImportBtn.addEventListener('click', () => {
    badgeFileInput.click();
  });

  badgeFileInput.addEventListener('change', async (e) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;

    try {
      badgeImportBtn.disabled = true;
      badgeImportBtn.textContent = '⏳ Import en cours...';

      const badge = await badgeManager.importBadge(file);
      
      // Ajouter le nouveau badge à l'interface
      createBadgeButton(badge, badgeImportedContainer, true);
      selectedBadge = badge;
      badgeInput.value = badge.content;
      badgeNameInput.value = badge.name; // Auto-fill le nom du badge

      badgeImportBtn.disabled = false;
      badgeImportBtn.textContent = '➕ Importer un Badge';
      badgeFileInput.value = '';
    } catch (err) {
      console.error('[NSV] Badge import error:', err);
      badgeImportBtn.disabled = false;
      badgeImportBtn.textContent = '➕ Importer un Badge';
      alert('Erreur lors de l\'import du badge');
    }
  });
}

// Chat Customization Handler
function setupChatCustomization() {
  const badgeInput = document.getElementById('chatMyBadge') as HTMLInputElement;
  const badgeNameInput = document.getElementById('chatBadgeName') as HTMLInputElement;
  const effectSelect = document.getElementById('chatMyEffect') as HTMLSelectElement;
  const applyBtn = document.getElementById('chatApplyCustomization') as HTMLButtonElement;
  const successMsg = document.getElementById('chatCustomizationSuccess') as HTMLElement;

  // Load saved settings
  chrome.storage.sync.get('chatCustomization', (result: any) => {
    if (result.chatCustomization) {
      badgeInput.value = result.chatCustomization.myBadgeText || '';
      badgeNameInput.value = result.chatCustomization.myBadgeName || '';
      effectSelect.value = result.chatCustomization.myEffect || '';
    }
  });

  // Apply customization
  applyBtn.addEventListener('click', () => {
    const badgeText = badgeInput.value.trim();
    const badgeName = badgeNameInput.value.trim();
    const effectType = effectSelect.value;

    const settings: any = {
      enableMyBadge: badgeText.length > 0,
      myBadgeText: badgeText,
      myBadgeName: badgeName,
      enableMyEffect: effectType.length > 0,
      myEffect: effectType
    };

    chrome.storage.sync.set({ chatCustomization: settings }, () => {
      successMsg.textContent = '✅ Personnalisation enregistrée !';
      successMsg.style.color = '#4caf50';
      setTimeout(() => {
        successMsg.textContent = '';
      }, 3000);

      // Notify all tabs to update
      chrome.tabs.query({}, (tabs: any[]) => {
        tabs.forEach((tab: any) => {
          // Filtrer seulement les onglets Twitch
          if (tab.url && tab.url.includes('twitch.tv')) {
            chrome.tabs.sendMessage(tab.id, { type: 'CHAT_CUSTOMIZATION_UPDATED', settings }, (response: any) => {
              // Vérifier et ignorer silencieusement les erreurs
              if (chrome.runtime.lastError) {
                // L'onglet n'a pas le content script, c'est normal
                return;
              }
            });
          }
        });
      });
    });
  });
}

init();
setupBadgeManager();
setupChatCustomization();
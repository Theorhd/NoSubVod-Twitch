declare const chrome: any;

import { storage, VodDownload, ActiveDownload } from '../utils/storage';
import { IndexedDBHelper } from '../utils/indexed-db-helper';

const dbHelper = new IndexedDBHelper();

interface DownloadRequest {
  action: 'download';
  playlistUrl: string;
  vodInfo: any;
  qualityLabel: string;
  fileFormat?: 'ts' | 'mp4';
  clipStart?: number;
  clipEnd?: number;
}

interface DownloadProgress {
  percent: number;
  current: number;
  total: number;
  speed: number;
  downloadedBytes: number;
}

// Track active downloads (with pause support)
const activeDownloads = new Map<string, { abort: boolean; paused: boolean }>();

// Track download metadata for completion handling
const downloadMetadata = new Map<string, {
  vodInfo: any;
  qualityLabel: string;
  thumbnail: string;
  totalBytes: number;
  failedCount: number;
  segmentCount: number;
  fileFormat: 'ts' | 'mp4';
}>();

function showNotification(title: string, message: string) {
  storage.getSettings().then(settings => {
    if (settings.enableNotifications) {
      chrome.notifications.create({
        type: 'basic',
        iconUrl: chrome.runtime.getURL('assets/icons/icon.png'),
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

function getThumbnailUrl(vodId: string, width: number = 320, height: number = 180): string {
  return `https://static-cdn.jtvnw.net/cf_vods/${vodId}/thumb/thumb0-${width}x${height}.jpg`;
}

async function downloadVod(
  playlistUrl: string,
  vodInfo: any,
  qualityLabel: string,
  fileFormat: 'ts' | 'mp4' = 'ts',
  clipStart: number = 0,
  clipEnd: number = Infinity,
  sendResponse: (response: any) => void
): Promise<void> {
  const downloadId = `${vodInfo.id}_${Date.now()}`;
  activeDownloads.set(downloadId, { abort: false, paused: false });

  // Save active download state
  const activeDownload: ActiveDownload = {
    downloadId,
    vodInfo,
    qualityLabel,
    startTime: Date.now(),
    progress: {
      percent: 0,
      current: 0,
      total: 0,
      speed: 0,
      downloadedBytes: 0
    }
  };
  await storage.setActiveDownload(activeDownload);

  try {
  // Fetch playlist
  const resp = await fetch(playlistUrl);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const playlistText = await resp.text();

    // Construire la liste des segments avec leurs durées
    const lines = playlistText.split('\n');
    const entries: { url: string; duration: number }[] = [];
    let lastDur = 0;
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('#EXTINF')) {
        lastDur = parseFloat(trimmed.split(':')[1]) || 0;
      } else if (trimmed && !trimmed.startsWith('#')) {
        const url = trimmed.startsWith('http')
          ? trimmed
          : new URL(trimmed, playlistUrl).toString();
        entries.push({ url, duration: lastDur });
      }
    }
    // Appliquer découpage temporel
    const segmentUrls: string[] = [];
    let cumTime = 0;
    for (const e of entries) {
      const segStart = cumTime;
      const segEnd = cumTime + e.duration;
      if (segEnd > clipStart && segStart < clipEnd) {
        segmentUrls.push(e.url);
      }
      cumTime += e.duration;
    }
    if (segmentUrls.length === 0) {
      throw new Error('Aucun segment trouvé dans la plage spécifiée');
    }

    // Check storage quota before starting download
    const estimatedSize = segmentUrls.length * 1024 * 1024; // Rough estimate: 1MB per segment
    try {
      const quotaInfo = await dbHelper.checkStorageQuota();
      console.log(`[NoSubVod] Storage quota - Usage: ${formatBytes(quotaInfo.usage)}, Available: ${formatBytes(quotaInfo.available)}`);
      
      if (quotaInfo.available < estimatedSize && quotaInfo.available !== Infinity) {
        const needed = formatBytes(estimatedSize);
        const available = formatBytes(quotaInfo.available);
        throw new Error(`Espace de stockage insuffisant. Requis: ~${needed}, Disponible: ${available}`);
      }
    } catch (quotaError: any) {
      console.warn('[NoSubVod] Could not check storage quota:', quotaError.message);
      // Continue anyway if quota check fails
    }


    let failedCount = 0;
    let totalBytes = 0;
    let successfulSegments = 0;
    const downloadStartTime = Date.now();

    // Download and store segments directly to IndexedDB (avoid memory overflow)
    for (let i = 0; i < segmentUrls.length; i++) {
      // Check if download was aborted or paused
      const downloadState = activeDownloads.get(downloadId);
      if (downloadState?.abort) {
        throw new Error('Téléchargement annulé');
      }
      
      // Pause handling - wait until resumed or aborted
      if (downloadState?.paused) {
        await new Promise<void>(resolve => {
          const interval = setInterval(() => {
            const st = activeDownloads.get(downloadId);
            if (!st?.paused || st?.abort) {
              clearInterval(interval);
              resolve();
            }
          }, 500);
        });
        if (activeDownloads.get(downloadId)?.abort) {
          throw new Error('Téléchargement annulé');
        }
      }

      try {
        const segResp = await fetch(segmentUrls[i]);
        if (!segResp.ok) {
          console.warn(`[NoSubVod] Segment ${i+1} failed: HTTP ${segResp.status}, skipping...`);
          failedCount++;
          continue;
        }
        const buf = await segResp.arrayBuffer();
        
        // Store directly to IndexedDB to avoid memory overflow
        await dbHelper.storeSegment(downloadId, successfulSegments, buf);
        successfulSegments++;
        totalBytes += buf.byteLength;
        
        // Log storage progress periodically
        if (successfulSegments % 50 === 0 || i === segmentUrls.length - 1) {
          console.log(`[NoSubVod] Stored ${successfulSegments} segments in IndexedDB (${formatBytes(totalBytes)})`);
        }

        // Send progress update
        const elapsed = (Date.now() - downloadStartTime) / 1000;
        const speed = elapsed > 0 ? totalBytes / elapsed : 0;
        const progress: DownloadProgress = {
          percent: Math.round(((i + 1) / segmentUrls.length) * 100),
          current: i + 1,
          total: segmentUrls.length,
          speed,
          downloadedBytes: totalBytes
        };

        // Update active download state
        const activeDownload = await storage.getActiveDownload();
        if (activeDownload) {
          activeDownload.progress = progress;
          await storage.setActiveDownload(activeDownload);
        }

        // Notify popup of progress (if still open)
        chrome.runtime.sendMessage({
          action: 'downloadProgress',
          downloadId,
          progress
        }).catch(() => {
          // Popup might be closed, ignore error
        });
      } catch (e) {
        console.warn(`[NoSubVod] Segment ${i+1} error:`, e, ', skipping...');
        failedCount++;
      }
    }

    if (successfulSegments === 0) {
      throw new Error('Aucun segment n\'a pu être téléchargé');
    }

    console.log('[NoSubVod] All segments downloaded, total size:', totalBytes);

    const settings = await storage.getSettings();
    const thumbnail = settings.showThumbnails 
      ? vodInfo.previewThumbnailURL || getThumbnailUrl(vodInfo.id) 
      : '';
    
    console.log('[NoSubVod] All segments already stored in IndexedDB');
    
    // Store metadata for completion handling
    downloadMetadata.set(downloadId, {
      vodInfo,
      qualityLabel,
      thumbnail,
      totalBytes,
      failedCount,
      segmentCount: successfulSegments,
      fileFormat
    });
    
    // Determine file extension based on format
    const fileExtension = fileFormat === 'mp4' ? 'mp4' : 'ts';
    const filename = `twitch_vod_${vodInfo.id}.${fileExtension}`;
    
    // Open download page (this has user context for showSaveFilePicker)
    const downloadUrl = chrome.runtime.getURL('dist/download.html') +
      `?downloadId=${encodeURIComponent(downloadId)}` +
      `&filename=${encodeURIComponent(filename)}` +
      `&segmentCount=${successfulSegments}` +
      `&fileFormat=${encodeURIComponent(fileFormat)}`;
    
    chrome.tabs.create({ url: downloadUrl });

    chrome.notifications.create({
      type: 'basic',
      iconUrl: chrome.runtime.getURL('assets/icons/icon.png'),
      title: 'NoSubVod',
      message: 'Une page de téléchargement s\'est ouverte...',
    });
    
    // Wait for file write completion from offscreen document
    // The completion will be handled by a message listener
  } catch (e: any) {
    console.error('[NoSubVod] Download error:', e);
    
    // Clear active download
    await storage.clearActiveDownload();
    
    showNotification(
      '❌ Échec du téléchargement',
      e.message || 'Une erreur est survenue'
    );

    activeDownloads.delete(downloadId);
    
    // Notify popup of failure
    chrome.runtime.sendMessage({
      action: 'downloadComplete',
      downloadId,
      success: false,
      error: e.message || e
    }).catch(() => {});

    sendResponse({
      success: false,
      error: e.message || e
    });
  }
}

// Listen for messages from popup
chrome.runtime.onMessage.addListener(
  (request: any, sender: any, sendResponse: (response: any) => void) => {
    if (request.action === 'download') {
      const req = request as DownloadRequest;
      downloadVod(
        req.playlistUrl,
        req.vodInfo,
        req.qualityLabel,
        req.fileFormat ?? 'ts',
        req.clipStart ?? 0,
        req.clipEnd ?? Infinity,
        sendResponse
      );
      return true; // Keep message channel open for async response
    }

    if (request.action === 'cancelDownload') {
      const downloadState = activeDownloads.get(request.downloadId);
      if (downloadState) {
        downloadState.abort = true;
        sendResponse({ success: true });
      } else {
        sendResponse({ success: false, error: 'Download not found' });
      }
      return true;
    }

    // Pause download
    if (request.action === 'pauseDownload') {
      const st = activeDownloads.get(request.downloadId);
      if (st) {
        st.paused = true;
        sendResponse({ success: true });
      } else {
        sendResponse({ success: false });
      }
      return true;
    }

    // Resume download
    if (request.action === 'resumeDownload') {
      const st = activeDownloads.get(request.downloadId);
      if (st) {
        st.paused = false;
        sendResponse({ success: true });
      } else {
        sendResponse({ success: false });
      }
      return true;
    }

    // Handle file write completion from offscreen document
    if (request.type === 'FILE_WRITE_COMPLETE') {
      handleFileWriteComplete(request).then(() => {
        sendResponse({ success: true });
      }).catch((error) => {
        sendResponse({ success: false, error: error.message });
      });
      return true;
    }

    // Handle file write error from offscreen document
    if (request.type === 'FILE_WRITE_ERROR') {
      handleFileWriteError(request);
      sendResponse({ success: true });
      return true;
    }

    return false;
  }
);

async function handleFileWriteComplete(request: any) {
  const { downloadId } = request;
  
  // Retrieve stored metadata
  const metadata = downloadMetadata.get(downloadId);
  if (!metadata) {
    console.error('[NoSubVod] No metadata found for download:', downloadId);
    return;
  }
  
  const { vodInfo, qualityLabel, thumbnail, totalBytes, failedCount, segmentCount } = metadata;
  
  console.log('[NoSubVod] File write completed');
  
  // Add to history
  const downloadRecord: VodDownload = {
    id: Date.now().toString(),
    vodId: vodInfo.id,
    channel: vodInfo.owner?.displayName || vodInfo.owner?.login || 'Unknown',
    title: vodInfo.title || 'Untitled VOD',
    quality: qualityLabel,
    thumbnail,
    downloadDate: new Date().toISOString(),
    fileSize: totalBytes,
    segments: segmentCount,
    failedSegments: failedCount || 0,
    duration: vodInfo.lengthSeconds || 0,
    success: true
  };

  await storage.addToHistory(downloadRecord);
  await storage.cleanupOldDownloads();
  
  // Clear active download
  await storage.clearActiveDownload();

  showNotification(
    '✅ Téléchargement terminé',
    `${vodInfo.title} (${qualityLabel}) - ${formatBytes(totalBytes)}`
  );

  // Cleanup
  activeDownloads.delete(downloadId);
  downloadMetadata.delete(downloadId);
  
  console.log('[NoSubVod] Download completed successfully');
  
  // Notify popup that download is complete
  chrome.runtime.sendMessage({
    action: 'downloadComplete',
    downloadId,
    success: true,
    totalBytes,
    failedCount: failedCount || 0
  }).catch(() => {});
}

async function handleFileWriteError(request: any) {
  const { downloadId, error } = request;
  
  console.error('[NoSubVod] File write error:', error);
  
  await storage.clearActiveDownload();
  activeDownloads.delete(downloadId);
  downloadMetadata.delete(downloadId);
  
  showNotification('❌ Échec du téléchargement', error || 'Erreur lors de l\'écriture du fichier');
  
  chrome.runtime.sendMessage({
    action: 'downloadComplete',
    downloadId,
    success: false,
    error
  }).catch(() => {});
}

// Highlight extension icon when on Twitch pages with more visible indicators
function updateExtensionVisibility(tabId: number, url: string) {
  const isTwitchPage = /^https?:\/\/(www\.)?twitch\.tv\//.test(url);
  
  if (isTwitchPage) {
    // Show prominent badge
    chrome.action.setBadgeText({ text: 'ON', tabId });
    chrome.action.setBadgeBackgroundColor({ color: '#00FF00', tabId }); // Bright green for visibility
    chrome.action.setTitle({ 
      title: '✓ NoSubVod Twitch - ACTIF\nCliquez pour télécharger des VODs', 
      tabId 
    });
    // Enable the action
    chrome.action.enable(tabId);
  } else {
    // Less prominent on non-Twitch pages
    chrome.action.setBadgeText({ text: '', tabId });
    chrome.action.setTitle({ title: 'NoSubVod Twitch\n(Visitez twitch.tv pour activer)', tabId });
    // Keep enabled but without badge
    chrome.action.enable(tabId);
  }
}

// Listen for tab updates
chrome.tabs.onUpdated.addListener((tabId: number, changeInfo: any, tab: any) => {
  // Update on any URL change, not just when complete
  if (tab.url && (changeInfo.status === 'complete' || changeInfo.url)) {
    updateExtensionVisibility(tabId, tab.url);
  }
});

// Listen for tab activation (when user switches tabs)
chrome.tabs.onActivated.addListener((activeInfo: any) => {
  chrome.tabs.get(activeInfo.tabId, (tab: any) => {
    if (tab.url) {
      updateExtensionVisibility(activeInfo.tabId, tab.url);
    }
  });
});

// Handle existing tabs when extension loads/reloads
chrome.tabs.query({}, (tabs: any[]) => {
  tabs.forEach((tab: any) => {
    if (tab.id && tab.url) {
      updateExtensionVisibility(tab.id, tab.url);
    }
  });
});

// Use declarativeContent to show page action on Twitch
chrome.runtime.onInstalled.addListener(() => {
  chrome.declarativeContent.onPageChanged.removeRules(undefined, () => {
    chrome.declarativeContent.onPageChanged.addRules([
      {
        conditions: [
          new chrome.declarativeContent.PageStateMatcher({
            pageUrl: { hostSuffix: 'twitch.tv' }
          })
        ],
        actions: [new chrome.declarativeContent.ShowAction()]
      }
    ]);
  });
});

console.log('[NoSubVod] Background service worker loaded');

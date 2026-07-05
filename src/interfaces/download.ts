// Download page script - handles fetching, IndexedDB, and FileSystem Access API
declare const chrome: any;

import { IndexedDBHelper } from '../utils/indexed-db-helper';
import { storage, ActiveDownload } from '../utils/storage';

const dbHelper = new IndexedDBHelper();

const statusEl = document.getElementById('status') as HTMLElement;
const infoEl = document.getElementById('info') as HTMLElement;
const startBtn = document.getElementById('startBtn') as HTMLButtonElement;
const progressContainer = document.getElementById('progressContainer') as HTMLElement;
const progressBar = document.getElementById('progressBar') as HTMLElement;
const progressText = document.getElementById('progressText') as HTMLElement;
const progressSpeed = document.getElementById('progressSpeed') as HTMLElement;
const progressTime = document.getElementById('progressTime') as HTMLElement;

let completionMessageSent = false;
let isAborted = false;
let isPaused = false;

function updateStatus(message: string, type: 'info' | 'success' | 'error' = 'info') {
  statusEl.textContent = message;
  statusEl.classList.remove('hidden', 'success', 'error');
  if (type === 'success') {
    statusEl.classList.add('success');
  } else if (type === 'error') {
    statusEl.classList.add('error');
  }
  console.log('[NoSubVod Download]', message);
}

function updateProgress(current: number, total: number) {
  const percent = Math.round((current / total) * 100);
  progressBar.style.width = percent + '%';
  if (progressText) {
    progressText.textContent = percent + '%';
  }
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}

const urlParams = new URLSearchParams(window.location.search);
const downloadId = urlParams.get('downloadId');
const filename = urlParams.get('filename');

if (!downloadId || !filename) {
  updateStatus('❌ Paramètres manquants', 'error');
  startBtn.disabled = true;
} else {
  // Load params from session storage
  chrome.storage.session.get([`download_params_${downloadId}`], async (result: any) => {
    const params = result[`download_params_${downloadId}`];
    if (!params) {
      updateStatus('❌ Impossible de charger les détails du téléchargement.', 'error');
      startBtn.disabled = true;
      return;
    }

    const { playlistUrl, vodInfo, qualityLabel, fileFormat, clipStart, clipEnd } = params;

    const settings = await storage.getSettings();
    infoEl.innerHTML = `
      <strong>Prêt à télécharger votre VOD !</strong><br>
      Fichier : <code>${filename}</code><br>
      Qualité : <strong>${qualityLabel}</strong><br>
    `;

    startBtn.addEventListener('click', async () => {
      startBtn.disabled = true;
      infoEl.classList.add('hidden');
      progressContainer.style.display = 'block';
      progressContainer.classList.add('visible');
      
      try {
        await executeFullDownload(downloadId, filename, playlistUrl, vodInfo, qualityLabel, fileFormat, clipStart, clipEnd, settings);
      } catch (err: any) {
        handleError(err);
      }
    });
  });
}

// Fallback download function using <a download>
async function downloadWithAnchor(blobUrl: string, filename: string, downloadId: string, segmentCount: number) {
  updateStatus('Téléchargement via méthode alternative...');
  
  const a = document.createElement('a');
  a.href = blobUrl;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  
  console.log('[NoSubVod Download] Fallback download triggered');
  updateStatus('✅ Téléchargement démarré ! Gardez cette page ouverte.', 'success');
  
  setTimeout(() => {
    URL.revokeObjectURL(blobUrl);
    document.body.removeChild(a);
    console.log('[NoSubVod Download] Blob URL revoked');
  }, 180000);
  
  setTimeout(async () => {
    await dbHelper.deleteDownload(downloadId, segmentCount);
    console.log('[NoSubVod Download] IndexedDB cleaned up');
    
    if (!completionMessageSent) {
      completionMessageSent = true;
      chrome.runtime.sendMessage({
        type: 'FILE_WRITE_COMPLETE',
        downloadId
      });
    }
    
    setTimeout(() => window.close(), 2000);
  }, 10000);
}

function handleError(error: any) {
  console.error('[NoSubVod Download] Error:', error);
  progressContainer.style.display = 'none';
  progressContainer.classList.remove('visible');
  startBtn.classList.remove('hidden');
  startBtn.disabled = false;
  infoEl.classList.remove('hidden');
  
  updateStatus('❌ Erreur : ' + error.message, 'error');
  
  if (downloadId) {
    chrome.runtime.sendMessage({
      type: 'FILE_WRITE_ERROR',
      downloadId,
      error: error.message || 'Unknown error'
    });
  }
}

async function executeFullDownload(
  downloadId: string, 
  filename: string,
  playlistUrl: string, 
  vodInfo: any, 
  qualityLabel: string, 
  fileFormat: string, 
  clipStart: number, 
  clipEnd: number,
  userSettings: any
) {
  updateStatus('Récupération de la playlist...');
  
  const resp = await fetch(playlistUrl);
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  const playlistText = await resp.text();

  const lines = playlistText.split('\n');
  const entries: { url: string; duration: number }[] = [];
  let initSegmentUrl: string | null = null;
  let lastDur = 0;
  
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('#EXT-X-MAP')) {
      const match = /URI="([^"]+)"/i.exec(trimmed) || /URI=([^,\\s]+)/i.exec(trimmed);
      const rawUrl = match?.[1]?.replace(/"/g, '');
      if (rawUrl) {
        initSegmentUrl = rawUrl.startsWith('http')
          ? rawUrl
          : new URL(rawUrl, playlistUrl).toString();
      }
    } else if (trimmed.startsWith('#EXTINF')) {
      lastDur = Number.parseFloat(trimmed.split(':')[1]) || 0;
    } else if (trimmed && !trimmed.startsWith('#')) {
      const url = trimmed.startsWith('http')
        ? trimmed
        : new URL(trimmed, playlistUrl).toString();
      entries.push({ url, duration: lastDur });
    }
  }

  const playlistUsesMp4 = entries.some(entry => entry.url.includes('.mp4')) || !!initSegmentUrl;
  const resolvedFileFormat = playlistUsesMp4 ? 'mp4' : 'ts';

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

  if (initSegmentUrl && resolvedFileFormat === 'mp4') {
    segmentUrls.unshift(initSegmentUrl);
  }

  if (segmentUrls.length === 0) {
    throw new Error('Aucun segment trouvé dans la plage spécifiée');
  }

  updateStatus(`Téléchargement de ${segmentUrls.length} segments...`);
  
  let failedCount = 0;
  let totalBytes = 0;
  let successfulSegments = 0;
  const downloadStartTime = Date.now();
  const chunkSize = userSettings.downloadChunkSize || 5;

  async function downloadSegmentWithRetry(url: string, segmentIndex: number, maxRetries = 3) {
    let is403 = false;
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        if (isAborted) throw new Error('Téléchargement annulé');
        
        if (attempt > 0) {
          const delay = Math.pow(2, attempt) * 1000 + Math.random() * 1000;
          await new Promise(r => setTimeout(r, delay));
        }

        const segResp = await fetch(url, {
          signal: AbortSignal.timeout(30000)
        });

        if (!segResp.ok) {
          if (segResp.status === 403) {
            is403 = true;
            throw new Error(`HTTP 403`);
          }
          throw new Error(`HTTP ${segResp.status}`);
        }

        const buf = await segResp.arrayBuffer();
        return { buffer: buf, is403: false };
      } catch (err: any) {
        if (err.message === 'Téléchargement annulé') throw err;
        if (err.message.includes('403')) is403 = true;
        if (attempt === maxRetries - 1 && !is403) {
          console.warn(`Segment ${segmentIndex} failed:`, err);
        }
      }
    }
    return { buffer: null, is403 };
  }

  let consecutiveFailures = 0;
  let total403Errors = 0;

  for (let batchStart = 0; batchStart < segmentUrls.length; batchStart += chunkSize) {
    if (isAborted) throw new Error('Téléchargement annulé');
    
    while (isPaused) {
      await new Promise(r => setTimeout(r, 500));
      if (isAborted) throw new Error('Téléchargement annulé');
    }

    if (consecutiveFailures - total403Errors >= 30) {
      throw new Error(`Trop d'échecs réseau consécutifs.`);
    }

    const batchEnd = Math.min(batchStart + chunkSize, segmentUrls.length);
    const batchPromises = [];
    
    for (let i = batchStart; i < batchEnd; i++) {
      const p = downloadSegmentWithRetry(segmentUrls[i], i).then(async (result) => {
        if (result.buffer) {
          await dbHelper.storeSegment(downloadId, i, result.buffer);
          successfulSegments++;
          totalBytes += result.buffer.byteLength;
          consecutiveFailures = 0;
        } else if (result.is403) {
          failedCount++;
          total403Errors++;
          consecutiveFailures++;
        } else {
          failedCount++;
          consecutiveFailures++;
        }
      });
      batchPromises.push(p);
    }

    await Promise.all(batchPromises);

    updateProgress(successfulSegments, segmentUrls.length);
    if (progressSpeed) {
      progressSpeed.textContent = `${successfulSegments}/${segmentUrls.length} segments`;
    }
    
    // Update active download state to notify UI
    const progressPercent = Math.round((successfulSegments / segmentUrls.length) * 100);
    const elapsed = (Date.now() - downloadStartTime) / 1000;
    const speed = elapsed > 0 ? totalBytes / elapsed : 0;
    
    const ad = await storage.getActiveDownload();
    if (ad && ad.downloadId === downloadId) {
      ad.progress = {
        percent: progressPercent,
        current: successfulSegments,
        total: segmentUrls.length,
        speed,
        downloadedBytes: totalBytes
      };
      await storage.setActiveDownload(ad);
    }
  }

  if (successfulSegments === 0) {
    throw new Error('Aucun segment n\'a pu être téléchargé.');
  }

  updateStatus('Création du fichier final...');

  // Load and concatenate segments in batches
  const BATCH_SIZE = 100;
  const blobParts: Blob[] = [];
  
  for (let batchStart = 0; batchStart < segmentUrls.length; batchStart += BATCH_SIZE) {
    const batchEnd = Math.min(batchStart + BATCH_SIZE, segmentUrls.length);
    const batchBuffers: ArrayBuffer[] = [];
    
    for (let i = batchStart; i < batchEnd; i++) {
      const segment = await dbHelper.getSegment(downloadId, i);
      if (segment) {
        batchBuffers.push(segment);
      }
    }
    
    if (batchBuffers.length > 0) {
      const batchBlob = new Blob(batchBuffers, { type: resolvedFileFormat === 'mp4' ? 'video/mp4' : 'video/mp2t' });
      blobParts.push(batchBlob);
    }
  }

  const mimeType = resolvedFileFormat === 'mp4' ? 'video/mp4' : 'video/mp2t';
  const blob = new Blob(blobParts, { type: mimeType });
  const blobUrl = URL.createObjectURL(blob);

  updateStatus('Démarrage de la sauvegarde...', 'success');

  try {
    const chromeDownloadId = await new Promise<number>((resolve, reject) => {
      chrome.downloads.download({
        url: blobUrl,
        filename: filename,
        saveAs: true
      }, (id: number) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(id);
        }
      });
    });

    const checkInterval = setInterval(() => {
      chrome.downloads.search({ id: chromeDownloadId }, async (downloads: any[]) => {
        if (downloads.length > 0) {
          const dl = downloads[0];
          if (dl.state === 'complete') {
            clearInterval(checkInterval);
            URL.revokeObjectURL(blobUrl);
            await cleanupAndComplete(downloadId, segmentUrls.length, vodInfo, qualityLabel, totalBytes, failedCount, resolvedFileFormat);
          } else if (dl.state === 'interrupted') {
            clearInterval(checkInterval);
            downloadWithAnchor(blobUrl, filename, downloadId, segmentUrls.length);
          }
        }
      });
    }, 1000);
  } catch (error: any) {
    downloadWithAnchor(blobUrl, filename, downloadId, segmentUrls.length);
  }
}

async function cleanupAndComplete(downloadId: string, segmentCount: number, vodInfo: any, qualityLabel: string, totalBytes: number, failedCount: number, format: string) {
  updateStatus('✅ Téléchargement terminé !', 'success');
  await dbHelper.deleteDownload(downloadId, segmentCount);
  
  if (!completionMessageSent) {
    completionMessageSent = true;
    
    // Pass metadata back to background
    const settings = await storage.getSettings();
    const thumbnail = settings.showThumbnails ? (vodInfo.previewThumbnailURL || '') : '';

    chrome.runtime.sendMessage({
      type: 'FILE_WRITE_COMPLETE',
      downloadId,
      metadata: {
        vodInfo,
        qualityLabel,
        thumbnail,
        totalBytes,
        failedCount,
        segmentCount,
        fileFormat: format
      }
    });
  }
  
  setTimeout(() => window.close(), 3000);
}

chrome.runtime.onMessage.addListener((request: any, sender: any, sendResponse: (response: any) => void) => {
  if (request.action === 'cancelDownload' && request.downloadId === downloadId) {
    isAborted = true;
    sendResponse({ success: true });
  }
  if (request.action === 'pauseDownload' && request.downloadId === downloadId) {
    isPaused = true;
    sendResponse({ success: true });
  }
  if (request.action === 'resumeDownload' && request.downloadId === downloadId) {
    isPaused = false;
    sendResponse({ success: true });
  }
});

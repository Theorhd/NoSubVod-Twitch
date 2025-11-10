declare const chrome: any;

import { storage, VodDownload, ActiveDownload } from '../utils/storage';
import { IndexedDBHelper } from '../utils/indexed-db-helper';
import { VideoCompressor } from '../utils/video-compressor';

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
  // Get settings for compression option
  const userSettings = await storage.getSettings();
  const shouldCompress = userSettings.compressVideo;
  
  if (shouldCompress) {
    console.log('[NoSubVod] Video compression enabled - files will be smaller but download may be slower');
  }
  
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
    const chunkSize = userSettings.downloadChunkSize || 5;
    
    // Prepare segments array to track download status
    const segmentResults: Array<{ index: number; buffer: ArrayBuffer | null }> = 
      new Array(segmentUrls.length).fill(null).map((_, i) => ({ index: i, buffer: null }));

    /**
     * Download a single segment with retry logic and exponential backoff
     * Returns an object with the buffer and error information
     */
    async function downloadSegmentWithRetry(
      url: string, 
      segmentIndex: number, 
      maxRetries: number = 3
    ): Promise<{ buffer: ArrayBuffer | null; is403: boolean }> {
      let lastError: Error | null = null;
      let is403 = false;
      
      // User agents rotation to avoid 403 blocks
      const userAgents = [
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:132.0) Gecko/20100101 Firefox/132.0',
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
      ];
      
      for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
          // Check if download was aborted
          if (activeDownloads.get(downloadId)?.abort) {
            throw new Error('Téléchargement annulé');
          }
          
          // Add delay between attempts to avoid rate limiting
          if (attempt > 0) {
            const baseDelay = Math.pow(2, attempt) * 1000; // 2s, 4s, 8s
            const jitter = Math.random() * 1000; // Add 0-1s random jitter
            const delay = baseDelay + jitter;
            await new Promise(resolve => setTimeout(resolve, delay));
          }
          
          // Rotate User-Agent for each attempt to avoid blocks
          const userAgent = userAgents[attempt % userAgents.length];
          
          // Fetch with proper headers to avoid 403
          const segResp = await fetch(url, {
            headers: {
              'User-Agent': userAgent,
              'Accept': '*/*',
              'Accept-Language': 'en-US,en;q=0.9',
              'Origin': 'https://www.twitch.tv',
              'Referer': 'https://www.twitch.tv/',
              'Sec-Fetch-Dest': 'empty',
              'Sec-Fetch-Mode': 'cors',
              'Sec-Fetch-Site': 'cross-site'
            },
            // Add timeout to prevent hanging
            signal: AbortSignal.timeout(30000) // 30s timeout
          });
          
          if (!segResp.ok) {
            // Handle specific HTTP errors
            if (segResp.status === 403) {
              is403 = true;
              // Don't log each 403 - they're expected for copyrighted content
              throw new Error(`HTTP 403 - Copyrighted content`);
            } else if (segResp.status === 429) {
              throw new Error(`HTTP 429 Too Many Requests - Rate limited`);
            } else if (segResp.status >= 500) {
              throw new Error(`HTTP ${segResp.status} Server Error`);
            } else {
              throw new Error(`HTTP ${segResp.status}`);
            }
          }
          
          let buf: ArrayBuffer;
          try {
            buf = await segResp.arrayBuffer();
          } catch (memError: any) {
            if (memError.name === 'RangeError' || memError.message.includes('allocation')) {
              throw new Error('Memory allocation failed - segment too large');
            }
            throw memError;
          }
          
          // Compress segment if compression is enabled
          if (shouldCompress && VideoCompressor.shouldCompress(buf.byteLength)) {
            try {
              buf = await VideoCompressor.compressSegment(buf);
            } catch (compressError: any) {
              // Compression failed, continue with uncompressed buffer
            }
          }
          
          return { buffer: buf, is403: false };
        } catch (error: any) {
          lastError = error;
          
          // Don't retry if download was aborted
          if (error.message === 'Téléchargement annulé') {
            throw error;
          }
          
          // Mark as 403 if it's a copyright error
          if (error.message.includes('403')) {
            is403 = true;
          }
          
          // Log detailed error info only for non-403 errors
          if (!is403) {
            const errorType = error.name || 'Unknown';
            const errorMsg = error.message || 'Unknown error';
            
            if (attempt < maxRetries - 1) {
              console.warn(`[NoSubVod] Segment ${segmentIndex + 1} failed [${errorType}]: ${errorMsg} (attempt ${attempt + 1}/${maxRetries})`);
            } else {
              console.error(`[NoSubVod] Segment ${segmentIndex + 1} failed after ${maxRetries} attempts [${errorType}]: ${errorMsg}`);
            }
          }
        }
      }
      
      return { buffer: null, is403 };
    }

    // Download segments in parallel batches
    console.log(`[NoSubVod] Starting parallel download with ${chunkSize} concurrent segments`);
    console.log(`[NoSubVod] This will be approximately ${chunkSize}x faster than sequential download!`);
    
    let consecutiveFailures = 0;
    let total403Errors = 0; // Track copyright-blocked segments
    const maxConsecutiveFailures = 50; // Increased: 403 errors are expected for copyrighted content
    
    for (let batchStart = 0; batchStart < segmentUrls.length; batchStart += chunkSize) {
      // Check if download was aborted
      const downloadState = activeDownloads.get(downloadId);
      if (downloadState?.abort) {
        throw new Error('Téléchargement annulé');
      }
      
      // Only stop if we have too many consecutive NON-403 failures
      // 403 errors are expected for copyrighted music segments
      const nonCopyrightFailures = consecutiveFailures - total403Errors;
      if (nonCopyrightFailures >= 30) {
        console.error(`[NoSubVod] Stopping download: ${nonCopyrightFailures} consecutive non-copyright failures detected`);
        throw new Error(`Trop d'échecs de connexion (${nonCopyrightFailures}). Vérifiez votre connexion Internet.`);
      }
      
      // Pause handling - wait until resumed or aborted
      if (downloadState?.paused) {
        console.log('[NoSubVod] Download paused, waiting for resume...');
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
        console.log('[NoSubVod] Download resumed');
      }

      const batchEnd = Math.min(batchStart + chunkSize, segmentUrls.length);
      const batchPromises: Promise<void>[] = [];
      let batchSuccessCount = 0;
      let batch403Count = 0;
      
      // Add small delay between batches to avoid overwhelming the server
      if (batchStart > 0) {
        await new Promise(resolve => setTimeout(resolve, 100)); // 100ms between batches
      }
      
      // Download batch in parallel
      for (let i = batchStart; i < batchEnd; i++) {
        const segmentIndex = i;
        const promise = downloadSegmentWithRetry(segmentUrls[segmentIndex], segmentIndex)
          .then(async (result) => {
            if (result && result.buffer) {
              try {
                // Store directly to IndexedDB using the original segment index
                // This ensures segments are stored with their correct position
                await dbHelper.storeSegment(downloadId, segmentIndex, result.buffer);
                segmentResults[segmentIndex].buffer = result.buffer;
                successfulSegments++;
                totalBytes += result.buffer.byteLength;
                batchSuccessCount++;
                
                // Reset consecutive failures on success
                consecutiveFailures = 0;
                
                // Log compression info for first segment
                if (successfulSegments === 1 && shouldCompress) {
                  console.log(`[NoSubVod] First segment compressed and stored`);
                }
              } catch (storeError: any) {
                console.error(`[NoSubVod] Failed to store segment ${segmentIndex + 1}:`, storeError.message);
                failedCount++;
                consecutiveFailures++;
              }
            } else if (result && result.is403) {
              // 403 error - copyrighted content, this is expected
              failedCount++;
              total403Errors++;
              batch403Count++;
              consecutiveFailures++;
              // Don't log individual 403 errors as they clutter the console
            } else {
              // Other error (network, timeout, etc.)
              failedCount++;
              consecutiveFailures++;
            }
          })
          .catch((error) => {
            console.error(`[NoSubVod] Unexpected error processing segment ${segmentIndex + 1}:`, error);
            failedCount++;
            consecutiveFailures++;
          });
        
        batchPromises.push(promise);
      }
      
      // Wait for entire batch to complete
      await Promise.all(batchPromises);
      
      // If no segments succeeded in this batch, log warning
      if (batchSuccessCount === 0) {
        if (batch403Count > 0) {
          console.log(`[NoSubVod] Batch ${batchStart}-${batchEnd}: All segments blocked by copyright (${batch403Count} segments)`);
        } else {
          console.warn(`[NoSubVod] Warning: Entire batch failed (${batchStart}-${batchEnd})`);
        }
      } else if (batch403Count > 0) {
        console.log(`[NoSubVod] Batch ${batchStart}-${batchEnd}: ${batch403Count} segments skipped (copyrighted content)`);
      }
      
      // Log progress
      const progressPercent = Math.round((successfulSegments / segmentUrls.length) * 100);
      const copyrightedPercent = Math.round((total403Errors / segmentUrls.length) * 100);
      console.log(`[NoSubVod] Progress: ${successfulSegments}/${segmentUrls.length} segments (${progressPercent}%) - ${formatBytes(totalBytes)} | Copyrighted: ${total403Errors} (${copyrightedPercent}%)`);

      // Send progress update after each batch
      const elapsed = (Date.now() - downloadStartTime) / 1000;
      const speed = elapsed > 0 ? totalBytes / elapsed : 0;
      const progress: DownloadProgress = {
        percent: progressPercent,
        current: successfulSegments,
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
      
      // Force garbage collection hint (helps with memory)
      try {
        if ((globalThis as any).gc) {
          (globalThis as any).gc();
        }
      } catch (e) {
        // gc() not available or failed
      }
    }

    if (successfulSegments === 0) {
      throw new Error('Aucun segment n\'a pu être téléchargé');
    }

    const downloadDuration = (Date.now() - downloadStartTime) / 1000;
    const avgSpeed = totalBytes / downloadDuration;
    const successRate = ((successfulSegments / segmentUrls.length) * 100).toFixed(1);
    const copyrightRate = ((total403Errors / segmentUrls.length) * 100).toFixed(1);
    const otherFailures = failedCount - total403Errors;
    
    console.log('[NoSubVod] ═══════════════════════════════════════');
    console.log('[NoSubVod] 📊 Download Complete Summary');
    console.log('[NoSubVod] ═══════════════════════════════════════');
    console.log(`[NoSubVod] ✓ Downloaded: ${successfulSegments}/${segmentUrls.length} segments (${successRate}%)`);
    console.log(`[NoSubVod] 🎵 Copyrighted: ${total403Errors} segments (${copyrightRate}%) - Skipped`);
    if (otherFailures > 0) {
      console.log(`[NoSubVod] ✗ Failed: ${otherFailures} segments (network/other errors)`);
    }
    console.log(`[NoSubVod] 📦 Total size: ${formatBytes(totalBytes)}`);
    console.log(`[NoSubVod] ⏱️  Duration: ${Math.round(downloadDuration)}s`);
    console.log(`[NoSubVod] ⚡ Average speed: ${formatBytes(avgSpeed)}/s`);
    console.log(`[NoSubVod] 🚀 Parallel downloads: ${chunkSize} concurrent`);
    
    if (shouldCompress) {
      const estimatedOriginalSize = segmentUrls.length * 1024 * 1024; // ~1MB per segment
      const savings = estimatedOriginalSize - totalBytes;
      const savingsPercent = Math.round((savings / estimatedOriginalSize) * 100);
      console.log(`[NoSubVod] 🗜️  Compression saved: ${formatBytes(savings)} (~${savingsPercent}%)`);
    }
    
    if (total403Errors > 0) {
      console.log(`[NoSubVod] ℹ️  Note: ${total403Errors} segments were blocked due to copyright (music/audio). These parts will be missing from the downloaded VOD.`);
    }
    console.log('[NoSubVod] ═══════════════════════════════════════');

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
    
    // Create user-friendly error message
    let errorMessage = e.message || 'Une erreur est survenue';
    
    // Specific error messages based on error type
    if (errorMessage.includes('403')) {
      errorMessage = 'Accès refusé par Twitch (HTTP 403). Le VOD peut être restreint ou vos requêtes bloquées. Attendez quelques minutes et réessayez.';
    } else if (errorMessage.includes('429')) {
      errorMessage = 'Trop de requêtes (HTTP 429). Twitch limite le nombre de téléchargements. Attendez 5-10 minutes et réessayez.';
    } else if (errorMessage.includes('Memory') || errorMessage.includes('allocation')) {
      errorMessage = 'Mémoire insuffisante. Fermez d\'autres onglets/applications et réessayez avec un format de fichier plus léger.';
    } else if (errorMessage.includes('Failed to fetch')) {
      errorMessage = 'Erreur réseau. Vérifiez votre connexion Internet et réessayez.';
    } else if (errorMessage.includes('Quota')) {
      errorMessage = 'Espace de stockage insuffisant. Libérez de l\'espace disque et réessayez.';
    } else if (errorMessage.includes('consécutifs')) {
      // Keep the original message for consecutive failures
    } else if (!errorMessage.includes('annulé')) {
      errorMessage = `Erreur de téléchargement: ${errorMessage}`;
    }
    
    showNotification(
      '❌ Échec du téléchargement',
      errorMessage
    );

    activeDownloads.delete(downloadId);
    
    // Notify popup of failure
    chrome.runtime.sendMessage({
      action: 'downloadComplete',
      downloadId,
      success: false,
      error: errorMessage
    }).catch(() => {});

    sendResponse({
      success: false,
      error: errorMessage
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
    console.warn('[NoSubVod] No metadata found for download:', downloadId);
    console.warn('[NoSubVod] This may happen if the download completed from a previous session');
    
    // Clean up active downloads and return gracefully
    activeDownloads.delete(downloadId);
    await storage.clearActiveDownload();
    
    // Send completion message anyway
    chrome.runtime.sendMessage({
      action: 'downloadComplete',
      downloadId,
      success: true
    }).catch(() => {});
    
    return;
  }
  
  const { vodInfo, qualityLabel, thumbnail, totalBytes, failedCount, segmentCount } = metadata;
  
  console.log('[NoSubVod] ═══════════════════════════════════════');
  console.log('[NoSubVod] 📥 File Write Complete');
  console.log('[NoSubVod] ═══════════════════════════════════════');
  console.log(`[NoSubVod] Download ID: ${downloadId}`);
  console.log(`[NoSubVod] VOD: ${vodInfo.title} (${qualityLabel})`);
  console.log(`[NoSubVod] Segments: ${segmentCount}, Size: ${formatBytes(totalBytes)}`);
  console.log('[NoSubVod] ═══════════════════════════════════════');
  
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

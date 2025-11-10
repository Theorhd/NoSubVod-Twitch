// Download page script - handles FileSystem Access API
declare const chrome: any;

import { IndexedDBHelper } from '../utils/indexed-db-helper';
import { storage } from '../utils/storage';

const dbHelper = new IndexedDBHelper();

const statusEl = document.getElementById('status') as HTMLElement;
const infoEl = document.getElementById('info') as HTMLElement;
const startBtn = document.getElementById('startBtn') as HTMLButtonElement;
const progressContainer = document.getElementById('progressContainer') as HTMLElement;
const progressBar = document.getElementById('progressBar') as HTMLElement;
const progressText = document.getElementById('progressText') as HTMLElement;
const progressSpeed = document.getElementById('progressSpeed') as HTMLElement;
const progressTime = document.getElementById('progressTime') as HTMLElement;

// Flag to prevent duplicate completion messages
let completionMessageSent = false;

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

// Get download info from URL params (parsed once)
const params = new URLSearchParams(window.location.search);
const downloadId = params.get('downloadId');
const filename = params.get('filename');
const segmentCountStr = params.get('segmentCount');
const fileFormat = (params.get('fileFormat') || 'ts') as 'ts' | 'mp4';

if (!downloadId || !filename || !segmentCountStr) {
  updateStatus('❌ Paramètres manquants', 'error');
  startBtn.disabled = true;
} else {
  const segmentCount = parseInt(segmentCountStr);
  const fileSizeMB = Math.round(segmentCount * 9.4); // Approximation
  
  // Check if compression was used
  storage.getSettings().then(settings => {
    const compressionNote = settings.compressVideo 
      ? '<br><span style="color: #4caf50;">🗜️ Compression activée - taille réduite d\'environ 15%</span>' 
      : '';
    
    infoEl.innerHTML = `
      <strong>Prêt à télécharger votre VOD !</strong><br>
      Fichier : <code>${filename}</code><br>
      Taille approximative : <strong>${fileSizeMB} MB</strong><br>
      Segments : <strong>${segmentCount}</strong>${compressionNote}
    `;
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
  
  // Keep blob URL alive for 3 minutes
  setTimeout(() => {
    URL.revokeObjectURL(blobUrl);
    document.body.removeChild(a);
    console.log('[NoSubVod Download] Blob URL revoked');
  }, 180000);
  
  // Clean up IndexedDB after delay
  setTimeout(async () => {
    await dbHelper.deleteDownload(downloadId, segmentCount);
    console.log('[NoSubVod Download] IndexedDB cleaned up');
    
    // Notify background (only once)
    if (!completionMessageSent) {
      completionMessageSent = true;
      chrome.runtime.sendMessage({
        type: 'FILE_WRITE_COMPLETE',
        downloadId
      });
      console.log('[NoSubVod Download] Completion message sent to background');
    }
    
    // Auto-close after cleanup
    setTimeout(() => window.close(), 2000);
  }, 10000);
}

// Start download when button is clicked (user gesture required!)
startBtn.addEventListener('click', async () => {
  if (!downloadId || !filename || !segmentCountStr) {
    return;
  }
  
  const segmentCount = parseInt(segmentCountStr);
  
  try {
    startBtn.disabled = true;
    updateStatus('Chargement des segments...');
    infoEl.classList.add('hidden');
    progressContainer.style.display = 'block';
    progressContainer.classList.add('visible');
    
    // Load and concatenate segments in batches to avoid memory overflow
    const BATCH_SIZE = 100; // Process 100 segments at a time
    const blobParts: Blob[] = [];
    
    for (let batchStart = 0; batchStart < segmentCount; batchStart += BATCH_SIZE) {
      const batchEnd = Math.min(batchStart + BATCH_SIZE, segmentCount);
      const batchBuffers: ArrayBuffer[] = [];
      
      // Load one batch
      for (let i = batchStart; i < batchEnd; i++) {
        const segment = await dbHelper.getSegment(downloadId, i);
        
        if (!segment) {
          console.warn(`[NoSubVod Download] Segment ${i} not found, skipping`);
          continue;
        }
        
        batchBuffers.push(segment);
        
        updateProgress(i + 1, segmentCount);
        
        if ((i + 1) % 50 === 0 || i === segmentCount - 1) {
          console.log(`[NoSubVod Download] Loaded ${i + 1}/${segmentCount} segments`);
          if (progressSpeed) {
            progressSpeed.textContent = `${i + 1}/${segmentCount} segments`;
          }
        }
      }
      
      // Create a blob for this batch and add it to parts
      if (batchBuffers.length > 0) {
        const batchBlob = new Blob(batchBuffers, { type: 'video/mp2t' });
        blobParts.push(batchBlob);
        console.log(`[NoSubVod Download] Batch ${Math.floor(batchStart / BATCH_SIZE) + 1} processed`);
      }
    }
    
    updateStatus('Création du fichier...');
    
    // Determine MIME type based on format
    const mimeType = fileFormat === 'mp4' ? 'video/mp4' : 'video/mp2t';
    
    // Create final blob from all batch blobs
    const blob = new Blob(blobParts, { type: mimeType });
    console.log(`[NoSubVod Download] Final blob created (${fileFormat}), size: ${blob.size}`);
    
    updateStatus('Préparation du téléchargement...');
    
    // Create blob URL
    const blobUrl = URL.createObjectURL(blob);
    console.log(`[NoSubVod Download] Blob URL created: ${blobUrl}`);
    
    updateStatus('Démarrage du téléchargement...');
    
    // Try chrome.downloads first (shows in downloads bar)
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
      
      console.log('[NoSubVod Download] Chrome download started with ID:', chromeDownloadId);
      updateStatus('✅ Téléchargement démarré ! Ne fermez pas cette page.', 'success');
      
      // Monitor download progress
      const checkInterval = setInterval(() => {
        chrome.downloads.search({ id: chromeDownloadId }, async (downloads: any[]) => {
          if (downloads.length > 0) {
            const dl = downloads[0];
            
            if (dl.state === 'complete') {
              clearInterval(checkInterval);
              console.log('[NoSubVod Download] Download completed successfully');
              URL.revokeObjectURL(blobUrl);
              updateStatus('✅ Téléchargement terminé !', 'success');
              
              // Clean up IndexedDB
              await dbHelper.deleteDownload(downloadId, segmentCount);
              console.log('[NoSubVod Download] IndexedDB cleaned up');
              
              // Notify background (only once)
              if (!completionMessageSent) {
                completionMessageSent = true;
                chrome.runtime.sendMessage({
                  type: 'FILE_WRITE_COMPLETE',
                  downloadId
                });
                console.log('[NoSubVod Download] Completion message sent to background');
              }
              
              setTimeout(() => window.close(), 2000);
            } else if (dl.state === 'interrupted') {
              clearInterval(checkInterval);
              console.error('[NoSubVod Download] Download interrupted:', dl.error);
              
              // Fallback to <a download> method
              console.log('[NoSubVod Download] Trying fallback method...');
              downloadWithAnchor(blobUrl, filename, downloadId, segmentCount);
            }
          }
        });
      }, 1000);
      
    } catch (error: any) {
      console.error('[NoSubVod Download] chrome.downloads failed:', error);
      console.log('[NoSubVod Download] Using fallback method...');
      
      // Fallback to <a download>
      downloadWithAnchor(blobUrl, filename, downloadId, segmentCount);
    }
    
  } catch (error: any) {
    console.error('[NoSubVod Download] Error:', error);
    
    progressContainer.style.display = 'none';
    progressContainer.classList.remove('visible');
    startBtn.classList.remove('hidden');
    startBtn.disabled = false;
    infoEl.classList.remove('hidden');
    
    updateStatus('❌ Erreur : ' + error.message, 'error');
    
    if (downloadId && segmentCountStr) {
      // Clean up IndexedDB even on error
      try {
        await dbHelper.deleteDownload(downloadId, parseInt(segmentCountStr));
      } catch (cleanupError) {
        console.error('[NoSubVod Download] Cleanup error:', cleanupError);
      }
      
      // Notify background script of error
      chrome.runtime.sendMessage({
        type: 'FILE_WRITE_ERROR',
        downloadId,
        error: error.message || 'Unknown error'
      });
      console.log('[NoSubVod Download] Error message sent to background');
    }
  }
});


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

async function downloadVod(
  playlistUrl: string,
  vodInfo: any,
  qualityLabel: string,
  fileFormat: 'ts' | 'mp4' = 'mp4',
  clipStart: number = 0,
  clipEnd: number = Infinity,
  sendResponse: (response: any) => void
): Promise<void> {
  const downloadId = `${vodInfo.id}_${Date.now()}`;
  
  try {
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

    // Store download parameters in session storage for the download tab
    await chrome.storage.session.set({
      [`download_params_${downloadId}`]: {
        playlistUrl,
        vodInfo,
        qualityLabel,
        fileFormat,
        clipStart,
        clipEnd
      }
    });

    // Sanitize title for filename
    const sanitizedTitle = (vodInfo.title || 'Untitled VOD')
      .replace(/[<>:"/\\|?*]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .substring(0, 150);
    const filename = `${sanitizedTitle}.${fileFormat}`;

    // Open download page
    const downloadUrl = chrome.runtime.getURL('dist/download.html') +
      `?downloadId=${encodeURIComponent(downloadId)}` +
      `&filename=${encodeURIComponent(filename)}` +
      `&fileFormat=${encodeURIComponent(fileFormat)}`;
    
    chrome.tabs.create({ url: downloadUrl });

    showNotification('NoSubVod', 'Une page de téléchargement s\'est ouverte...');

    sendResponse({ success: true, downloadId });
  } catch (e: any) {
    console.error('[NoSubVod] Failed to initialize download:', e);
    await storage.clearActiveDownload();
    sendResponse({ success: false, error: e.message });
  }
}

// Listen for messages from popup and download tab
chrome.runtime.onMessage.addListener(
  (request: any, sender: any, sendResponse: (response: any) => void) => {
    if (request.action === 'download') {
      const req = request as DownloadRequest;
      downloadVod(
        req.playlistUrl,
        req.vodInfo,
        req.qualityLabel,
        req.fileFormat ?? 'mp4',
        req.clipStart ?? 0,
        req.clipEnd ?? Infinity,
        sendResponse
      );
      return true;
    }

    if (request.action === 'cancelDownload' || request.action === 'pauseDownload' || request.action === 'resumeDownload') {
      sendResponse({ success: true });
      return true;
    }

    // Handle file write completion
    if (request.type === 'FILE_WRITE_COMPLETE') {
      handleFileWriteComplete(request).then(() => {
        sendResponse({ success: true });
      }).catch((error) => {
        sendResponse({ success: false, error: error.message });
      });
      return true;
    }

    // Handle file write error
    if (request.type === 'FILE_WRITE_ERROR') {
      handleFileWriteError(request);
      sendResponse({ success: true });
      return true;
    }

    return false;
  }
);

async function handleFileWriteComplete(request: any) {
  const { downloadId, metadata } = request;
  
  if (!metadata) {
    console.warn('[NoSubVod] No metadata provided for download completion:', downloadId);
    await storage.clearActiveDownload();
    return;
  }
  
  const { vodInfo, qualityLabel, thumbnail, totalBytes, failedCount, segmentCount } = metadata;
  
  console.log('[NoSubVod] ═══════════════════════════════════════');
  console.log('[NoSubVod] 📥 File Download Complete');
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

  // Clean up session storage
  await chrome.storage.session.remove([`download_params_${downloadId}`]);
  
  console.log('[NoSubVod] Download completed successfully');
  
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
  await chrome.storage.session.remove([`download_params_${downloadId}`]);

  showNotification('❌ Échec du téléchargement', error || 'Erreur lors du téléchargement');
  
  chrome.runtime.sendMessage({
    action: 'downloadComplete',
    downloadId,
    success: false,
    error
  }).catch(() => {});
}

function updateExtensionVisibility(tabId: number, url: string) {
  const isTwitchPage = /^https?:\/\/(www\.)?twitch\.tv\//.test(url);
  
  if (isTwitchPage) {
    chrome.action.setBadgeText({ text: 'ON', tabId });
    chrome.action.setBadgeBackgroundColor({ color: '#00FF00', tabId });
    chrome.action.setTitle({ 
      title: '✓ NoSubVod Twitch - ACTIF\nCliquez pour télécharger des VODs', 
      tabId 
    });
    chrome.action.enable(tabId);
  } else {
    chrome.action.setBadgeText({ text: '', tabId });
    chrome.action.setTitle({ title: 'NoSubVod Twitch\n(Visitez twitch.tv pour activer)', tabId });
    chrome.action.enable(tabId);
  }
}

chrome.tabs.onUpdated.addListener((tabId: number, changeInfo: any, tab: any) => {
  if (tab.url && (changeInfo.status === 'complete' || changeInfo.url)) {
    updateExtensionVisibility(tabId, tab.url);
  }
});

chrome.tabs.onActivated.addListener((activeInfo: any) => {
  chrome.tabs.get(activeInfo.tabId, (tab: any) => {
    if (tab.url) {
      updateExtensionVisibility(activeInfo.tabId, tab.url);
    }
  });
});

chrome.tabs.query({}, (tabs: any[]) => {
  tabs.forEach((tab: any) => {
    if (tab.id && tab.url) {
      updateExtensionVisibility(tab.id, tab.url);
    }
  });
});

chrome.runtime.onInstalled.addListener(() => {
  chrome.declarativeContent.onPageChanged.removeRules(undefined, () => {
    chrome.declarativeContent.onPageChanged.addRules([
      {
        conditions: [
          new chrome.declarativeContent.PageStateMatcher({
            pageUrl: { hostSuffix: 'twitch.tv' }
          })
        ],
        actions: [new chrome.declarativeContent.ShowPageAction()]
      }
    ]);
  });
});

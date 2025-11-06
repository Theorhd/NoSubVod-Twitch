// Offscreen document for file system access (has access to DOM APIs)
console.log('[NoSubVod Offscreen] Document loaded');

declare const chrome: any;

import { IndexedDBHelper } from '../utils/indexed-db-helper';

const dbHelper = new IndexedDBHelper();

// @ts-ignore
chrome.runtime.onMessage.addListener((request: any, sender: any, sendResponse: any) => {
  if (request.type === 'WRITE_FILE') {
    handleFileWrite(request)
      .then(() => sendResponse({ success: true }))
      .catch((error) => {
        console.error('[NoSubVod Offscreen] Error:', error);
        sendResponse({ success: false, error: error.message });
      });
    return true; // Keep message channel open for async response
  }
});

async function handleFileWrite(request: any) {
  const { downloadId, filename, segmentCount } = request;
  
  console.log('[NoSubVod Offscreen] Starting file write for:', filename);
  console.log('[NoSubVod Offscreen] Segment count:', segmentCount);
  
  try {
    // Request file save location from user using FileSystem Access API
    const fileHandle = await (window as any).showSaveFilePicker({
      suggestedName: filename,
      types: [{
        description: 'MPEG-TS Video',
        accept: { 'video/mp2t': ['.ts'] }
      }]
    });
    
    console.log('[NoSubVod Offscreen] File handle obtained');
    
    // Create writable stream
    const writable = await fileHandle.createWritable();
    
    console.log('[NoSubVod Offscreen] Writable stream created');
    
    // Write segments one by one to avoid memory issues
    for (let i = 0; i < segmentCount; i++) {
      const segment = await dbHelper.getSegment(downloadId, i);
      
      if (!segment) {
        console.warn(`[NoSubVod Offscreen] Segment ${i} not found, skipping`);
        continue;
      }
      
      await writable.write(segment);
      
      if (i % 50 === 0 || i === segmentCount - 1) {
        console.log(`[NoSubVod Offscreen] Written ${i + 1}/${segmentCount} segments`);
      }
    }
    
    // Close the file
    await writable.close();
    
    console.log('[NoSubVod Offscreen] File write completed');
    
    // Clean up IndexedDB
    await dbHelper.deleteDownload(downloadId, segmentCount);
    console.log('[NoSubVod Offscreen] IndexedDB cleaned up');
    
    // Notify background script of completion
    chrome.runtime.sendMessage({
      type: 'FILE_WRITE_COMPLETE',
      downloadId
    });
    
  } catch (error: any) {
    console.error('[NoSubVod Offscreen] File write error:', error);
    
    // Clean up IndexedDB even on error
    try {
      await dbHelper.deleteDownload(downloadId, segmentCount);
    } catch (cleanupError) {
      console.error('[NoSubVod Offscreen] Cleanup error:', cleanupError);
    }
    
    // Notify background script of error
    chrome.runtime.sendMessage({
      type: 'FILE_WRITE_ERROR',
      downloadId,
      error: error.message || 'Unknown error'
    });
    
    throw error;
  }
}

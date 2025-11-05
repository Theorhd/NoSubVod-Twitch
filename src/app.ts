// Override Worker to inject patch_amazonworker script
function getWasmWorkerJs(twitchBlobUrl: string): string {
  console.log('[NSV] Fetching worker script from:', twitchBlobUrl);
  const req = new XMLHttpRequest();
  req.open('GET', twitchBlobUrl, false);
  req.overrideMimeType("text/javascript");
  req.send();
  console.log('[NSV] Worker script fetched, size:', req.responseText.length, 'bytes');
  return req.responseText;
}

const oldWorker = (window as any).Worker;
console.log('[NSV] Setting up Worker override...');

// Override Worker with patch support
try {
  (window as any).Worker = class Worker extends oldWorker {
    constructor(twitchBlobUrl: string) {
      console.log('[NSV] Creating new Worker with URL:', twitchBlobUrl);
      let workerUrl = twitchBlobUrl;
      try {
        const escapedUrl = twitchBlobUrl.replace(/'/g, "%27");
        const wasmJs = getWasmWorkerJs(escapedUrl);
        const patchUrl = (window as any).patch_url;
        console.log('[NSV] Injecting patch script:', patchUrl);
        const blobContent = `importScripts('${patchUrl}');\n${wasmJs}`;
        const blob = new Blob([blobContent], { type: 'application/javascript' });
        workerUrl = URL.createObjectURL(blob);
        console.log('[NSV] Worker patched successfully, new blob URL:', workerUrl);
      } catch (err) {
        console.error('[NSV] Worker patch failed, using original URL', err);
      }
      super(workerUrl);
      console.log('[NSV] Worker created and started');
    }
  };
  console.log('[NSV] Worker override installed successfully');
} catch (e) {
  console.error('[NSV] Worker override setup failed', e);
}

export {};

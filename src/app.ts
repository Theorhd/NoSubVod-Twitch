// Override Worker to inject patch_amazonworker script
function getWasmWorkerJs(twitchBlobUrl: string): string {
  const req = new XMLHttpRequest();
  req.open('GET', twitchBlobUrl, false);
  req.overrideMimeType("text/javascript");
  req.send();
  return req.responseText;
}

const oldWorker = (window as any).Worker;
// Override Worker with patch support
try {
  (window as any).Worker = class Worker extends oldWorker {
    constructor(twitchBlobUrl: string) {
      let workerUrl = twitchBlobUrl;
      try {
        const escapedUrl = twitchBlobUrl.replace(/'/g, "%27");
        const wasmJs = getWasmWorkerJs(escapedUrl);
        const blobContent = `importScripts('${(window as any).patch_url}');\n${wasmJs}`;
        const blob = new Blob([blobContent], { type: 'application/javascript' });
        workerUrl = URL.createObjectURL(blob);
      } catch (err) {
        console.error('[NSV] Worker patch failed, using original URL', err);
      }
      super(workerUrl);
    }
  };
} catch (e) {
  console.error('[NSV] Worker override setup failed', e);
}

export {};

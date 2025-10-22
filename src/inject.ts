// Page-context script injected via nosubvod.ts
(function() {
  // Only apply on VOD pages
  if (!window.location.pathname.includes('/videos/')) return;

  // Parse patch URL from script src query param
  const currentScript = document.currentScript as HTMLScriptElement;
  const query = currentScript.src.split('?')[1] || '';
  const params = new URLSearchParams(query);
  const patchUrl = params.get('patch');
  if (!patchUrl) return;

  // Worker override
  function getWasmWorkerJs(twitchBlobUrl: string): string {
    const req = new XMLHttpRequest();
    req.open('GET', twitchBlobUrl, false);
    req.overrideMimeType('text/javascript');
    req.send();
    return req.responseText;
  }

  const oldWorker = (window as any).Worker;
  (window as any).Worker = class Worker extends oldWorker {
    constructor(twitchBlobUrl: string) {
      let workerUrl = twitchBlobUrl;
      try {
        const escaped = twitchBlobUrl.replace(/'/g, "%27");
        const wasmJs = getWasmWorkerJs(escaped);
        const blobContent = `importScripts('${patchUrl}');\n${wasmJs}`;
        const blob = new Blob([blobContent], { type: 'application/javascript' });
        workerUrl = URL.createObjectURL(blob);
      } catch (err) {
        console.error('[NSV] Worker patch failed', err);
      }
      super(workerUrl);
    }
  };
})();

(() => {
  // Only apply on VOD pages
  if (!window.location.pathname.includes('/videos/')) return;

  // Override Worker to inject patch_amazonworker script
  const patchUrl = (window as any).chrome.runtime.getURL('dist/patch_amazonworker.js');
  const oldWorker = (window as any).Worker;

  (window as any).Worker = class Worker extends oldWorker {
    constructor(blobUrl: string) {
      let finalUrl = blobUrl;
      try {
        // Fetch original worker code synchronously
        const escaped = blobUrl.replace(/'/g, '%27');
        const req = new XMLHttpRequest();
        req.open('GET', escaped, false);
        req.overrideMimeType('text/javascript');
        req.send();
        const wasmJs = req.responseText;
        // Prepend patch script
        const content = `importScripts('${patchUrl}');\n${wasmJs}`;
        const blob = new Blob([content], { type: 'application/javascript' });
        finalUrl = URL.createObjectURL(blob);
      } catch (e) {
        console.error('[TNS] Worker patch failed', e);
      }
      super(finalUrl);
    }
  };
})();
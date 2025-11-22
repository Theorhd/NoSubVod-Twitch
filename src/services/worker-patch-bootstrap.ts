/**
 * worker-patch-bootstrap.ts
 * Script qui patche le Worker constructor IMMÉDIATEMENT
 * Ce fichier est injecté AVANT tous les autres scripts Twitch
 */

(() => {
  console.log('[NSV] 🚀 Patching Worker constructor immediately...');
  
  // Récupérer l'URL du patch depuis l'attribut data-patch-url du script actuel
  const currentScript = document.currentScript as HTMLScriptElement;
  const patchUrlFromAttr = currentScript?.getAttribute('data-patch-url');
  
  if (!patchUrlFromAttr) {
    console.error('[NSV] ❌ Patch URL not found in script data-patch-url attribute');
    return;
  }
  
  console.log('[NSV] 📦 Patch URL:', patchUrlFromAttr);
  
  // Patch le Worker immédiatement, de manière synchrone
  const OriginalWorker = window.Worker;
  const PATCH_URL = patchUrlFromAttr;
  
  (window as any).Worker = class PatchedWorker extends OriginalWorker {
    constructor(scriptURL: string | URL) {
      console.log('[NSV] 🔧 Worker constructor intercepted! URL:', scriptURL);
      
      const url = typeof scriptURL === 'string' ? scriptURL : scriptURL.toString();
      
      // Si c'est un Worker Amazon IVS (blob ou contenant wasmworker)
      if (url && (url.startsWith('blob:') || url.includes('wasmworker'))) {
        console.log('[NSV] 🎯 Amazon IVS Worker detected, injecting patch...');
        
        // Créer un loader qui charge le patch puis le Worker Twitch
        const loaderCode = `
          console.log('[NSV] 📦 Loading patch from:', '${PATCH_URL}');
          
          // Charger le patch de manière synchrone
          try {
            const xhr = new XMLHttpRequest();
            xhr.open('GET', '${PATCH_URL}', false);
            xhr.send();
            
            if (xhr.status === 200) {
              console.log('[NSV] ✅ Patch loaded successfully, executing...');
              eval(xhr.responseText);
              console.log('[NSV] ✅ Patch executed');
            } else {
              console.error('[NSV] ❌ Failed to load patch, status:', xhr.status);
            }
          } catch (e) {
            console.error('[NSV] ❌ Error loading patch:', e);
          }
          
          // Ensuite charger le Worker Twitch original
          try {
            console.log('[NSV] 📥 Loading Twitch worker:', '${url}');
            importScripts('${url}');
            console.log('[NSV] ✅ Twitch worker loaded');
          } catch (e) {
            console.error('[NSV] ❌ Error loading Twitch worker:', e);
          }
        `;
        
        const blob = new Blob([loaderCode], { type: 'application/javascript' });
        const patchedURL = URL.createObjectURL(blob);
        
        super(patchedURL);
      } else {
        // Autres Workers, laisser passer
        console.log('[NSV] ⏭️  Non-Amazon Worker, passing through');
        super(scriptURL);
      }
    }
  };
  
  console.log('[NSV] ✅ Worker constructor patched globally');
})();

export {};

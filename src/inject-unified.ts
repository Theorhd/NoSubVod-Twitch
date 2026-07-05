/**
 * inject-unified.ts
 * Script d'injection unifié qui utilise le nouveau système de features
 * Remplace l'ancien nosubvod.ts
 * 
 * Ce fichier s'exécute dans le contexte du CONTENT SCRIPT (accès à chrome.*)
 * et injecte les scripts nécessaires dans le contexte de la PAGE
 */

declare const chrome: any;

// Fonction d'injection du script de page - DOIT S'EXÉCUTER IMMÉDIATEMENT
function injectPageScript() {
  const patchUrl = chrome.runtime.getURL('dist/patch_amazonworker.js');
  const pageScriptUrl = chrome.runtime.getURL('dist/page-script-entry.js');
  const bootstrapUrl = chrome.runtime.getURL('dist/worker-patch-bootstrap.js');
  
  try {
    // Charger le script bootstrap qui patche Worker de manière synchrone
    // On passe l'URL du patch via un attribut data-*
    const bootstrapScript = document.createElement('script');
    bootstrapScript.src = bootstrapUrl;
    bootstrapScript.dataset.patchUrl = patchUrl;
    (document.head || document.documentElement).appendChild(bootstrapScript);
    
    console.log('[NSV] 🎯 Worker patch bootstrap injected');
    
    // Ensuite charger le script de page complet (asynchrone)
    const pageScript = document.createElement('script');
    pageScript.src = pageScriptUrl;
    pageScript.dataset.patchUrl = patchUrl;
    
    (document.head || document.documentElement).appendChild(pageScript);
    
    console.log('[NSV] 📜 Page script loaded');
  } catch (error) {
    console.error('[NSV] ❌ Error injecting scripts:', error);
  }
}

// S'exécute IMMÉDIATEMENT, même avant DOMContentLoaded
injectPageScript();

// Injecter le script de page
// Call removed because it's already done at the top of the file.

// Gérer les changements d'URL (SPA)
try {
  const _push = history.pushState;
  history.pushState = function(...args) {
    const res = _push.apply(this, args as any);
    globalThis.dispatchEvent(new Event('locationchange'));
    return res;
  };
  const _replace = history.replaceState;
  history.replaceState = function(...args) {
    const res = _replace.apply(this, args as any);
    globalThis.dispatchEvent(new Event('locationchange'));
    return res;
  };
  globalThis.addEventListener('popstate', () => globalThis.dispatchEvent(new Event('locationchange')));
} catch (error) {
  console.error('[NSV] Error setting up SPA navigation:', error);
}

// ============================================
// Chat Customizer Bridge (exécuté dans le contexte du content script)
// ============================================
try {
  function loadAndSendChatSettings() {
    chrome.storage.local.get('chatCustomization', (result: any) => {
      if (chrome.runtime.lastError) {
        console.error('[NSV] Error loading chat settings:', chrome.runtime.lastError);
        return;
      }
      if (result.chatCustomization) {
        // Convertir l'URL du badge si nécessaire (assets/ path)
        const settings = { ...result.chatCustomization };
        if (settings.myBadgeText?.startsWith('assets/')) {
          settings.myBadgeText = chrome.runtime.getURL(settings.myBadgeText);
        }
        
        (globalThis as any).NSV_SETTINGS = settings;
        globalThis.dispatchEvent(
          new CustomEvent('NSV_SETTINGS_UPDATED', {
            detail: settings,
          })
        );
        console.log('[NSV] Chat customization settings sent to page script');
      }
    });
  }

  function setupChatCustomizerBridge() {
    loadAndSendChatSettings();

    chrome.storage.onChanged.addListener((changes: any) => {
      if (changes.chatCustomization) {
        // Convertir l'URL du badge si nécessaire (assets/ path)
        const settings = { ...changes.chatCustomization.newValue };
        if (settings.myBadgeText?.startsWith('assets/')) {
          settings.myBadgeText = chrome.runtime.getURL(settings.myBadgeText);
        }
        
        (globalThis as any).NSV_SETTINGS = settings;
        globalThis.dispatchEvent(
          new CustomEvent('NSV_SETTINGS_UPDATED', {
            detail: settings,
          })
        );
        console.log('[NSV] Chat customization settings updated');
      }
    });
    
    globalThis.addEventListener('NSV_RELOAD_SETTINGS', () => {
      console.log('[NSV] Settings reload requested');
      loadAndSendChatSettings();
    });
  }

  setupChatCustomizerBridge();
} catch (error) {
  console.error('[NSV] Error setting up chat customizer bridge:', error);
}

// ============================================
// Initialiser les features du CONTENT SCRIPT
// Fait de manière asynchrone et non-bloquante
// ============================================
function initializeContentFeatures() {
  // Utiliser requestIdleCallback si disponible, sinon setTimeout
  const scheduleInit = (globalThis as any).requestIdleCallback || 
    ((cb: () => void) => setTimeout(cb, 1000)); // Augmenté à 1s pour laisser la page charger
  
  scheduleInit(async () => {
    try {
      // Timeout global pour toute l'initialisation
      await Promise.race([
        (async () => {
          const { FeatureManager, FeatureContext } = await import('./core');
          const { ChromeStorageAdapter } = await import('./core/storage-adapter');
          const { instantiateAllFeatures } = await import('./feature-registry');

          const contentManager = new FeatureManager({
            context: FeatureContext.CONTENT_SCRIPT,
            currentUrl: globalThis.location.href,
            storage: new ChromeStorageAdapter()
          });

          const allContentFeatures = instantiateAllFeatures();
          contentManager.registerMany(allContentFeatures);

          await contentManager.initializeAll();
          console.log('[NSV] Content script features initialized');

          (globalThis as any).__NSV_CONTENT_MANAGER__ = contentManager;
        })(),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Content features initialization timeout')), 10000)
        )
      ]);
    } catch (error: any) {
      console.error('[NSV] Failed to initialize content script features:', error);
      // Ne pas bloquer la page même en cas d'erreur
    }
  });
}

// Attendre que le DOM soit complètement prêt avant d'initialiser
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    // Petit délai supplémentaire pour laisser Twitch s'initialiser
    setTimeout(initializeContentFeatures, 100);
  });
} else {
  // DOM déjà prêt, initialiser après un court délai
  setTimeout(initializeContentFeatures, 100);
}

console.log('[NSV] Unified injection system loaded');

export {};

/**
 * inject-unified.ts
 * Script d'injection unifié qui utilise le nouveau système de features
 * Remplace l'ancien nosubvod.ts
 * 
 * Ce fichier s'exécute dans le contexte du CONTENT SCRIPT (accès à chrome.*)
 * et injecte les scripts nécessaires dans le contexte de la PAGE
 */

declare const chrome: any;

// Fonction d'injection du script de page
function injectPageScript() {
  const patchUrl = chrome.runtime.getURL('dist/patch_amazonworker.js');
  const pageScriptUrl = chrome.runtime.getURL('dist/page-script-entry.js');
  
  // Ajouter un paramètre de version pour éviter les problèmes de cache
  const version = chrome.runtime.getManifest().version;
  const pageScriptUrlWithVersion = `${pageScriptUrl}?v=${version}`;
  
  // Avec document_idle, on est sûr que documentElement existe
  const target = document.head || document.documentElement;
  
  const pageScript = document.createElement('script');
  pageScript.src = pageScriptUrlWithVersion;
  pageScript.setAttribute('data-patch-url', patchUrl);
  
  // Insérer au début pour exécution prioritaire
  if (target.firstChild) {
    target.insertBefore(pageScript, target.firstChild);
  } else {
    target.appendChild(pageScript);
  }
  
  console.log('[NSV] Page script injected');
}

// Fonction pour charger les settings de chat de manière asynchrone
async function loadChatSettings() {
  try {
    await new Promise<void>((resolve) => {
      chrome.storage.local.get('chatCustomization', (result: any) => {
        if (chrome.runtime.lastError) {
          console.warn('[NSV] Could not load chat settings:', chrome.runtime.lastError);
          resolve();
          return;
        }
        
        if (result.chatCustomization) {
          const settings = { ...result.chatCustomization };
          if (settings.myBadgeText && settings.myBadgeText.startsWith('assets/')) {
            settings.myBadgeText = chrome.runtime.getURL(settings.myBadgeText);
          }
          (window as any).NSV_SETTINGS = settings;
          console.log('[NSV] Chat settings preloaded');
          
          // Envoyer un event pour notifier que les settings sont prêts
          window.dispatchEvent(
            new CustomEvent('NSV_SETTINGS_UPDATED', {
              detail: settings,
            })
          );
        }
        resolve();
      });
    });
  } catch (error) {
    console.warn('[NSV] Error loading chat settings:', error);
  }
}

// Injecter le script de page
injectPageScript();

// Charger les settings de chat en arrière-plan (asynchrone)
loadChatSettings();

// Gérer les changements d'URL (SPA)
try {
  const _push = history.pushState;
  history.pushState = function(...args) {
    const res = _push.apply(this, args as any);
    window.dispatchEvent(new Event('locationchange'));
    return res;
  };
  const _replace = history.replaceState;
  history.replaceState = function(...args) {
    const res = _replace.apply(this, args as any);
    window.dispatchEvent(new Event('locationchange'));
    return res;
  };
  window.addEventListener('popstate', () => window.dispatchEvent(new Event('locationchange')));
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
        if (settings.myBadgeText && settings.myBadgeText.startsWith('assets/')) {
          settings.myBadgeText = chrome.runtime.getURL(settings.myBadgeText);
        }
        
        (window as any).NSV_SETTINGS = settings;
        window.dispatchEvent(
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
        if (settings.myBadgeText && settings.myBadgeText.startsWith('assets/')) {
          settings.myBadgeText = chrome.runtime.getURL(settings.myBadgeText);
        }
        
        (window as any).NSV_SETTINGS = settings;
        window.dispatchEvent(
          new CustomEvent('NSV_SETTINGS_UPDATED', {
            detail: settings,
          })
        );
        console.log('[NSV] Chat customization settings updated');
      }
    });
    
    window.addEventListener('NSV_RELOAD_SETTINGS', () => {
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
  const scheduleInit = (window as any).requestIdleCallback || 
    ((cb: () => void) => setTimeout(cb, 500));
  
  scheduleInit(async () => {
    try {
      const { FeatureManager, FeatureContext } = await import('./core');
      const { ChromeStorageAdapter } = await import('./core/storage-adapter');
      const { instantiateAllFeatures } = await import('./feature-registry');

      const contentManager = new FeatureManager({
        context: FeatureContext.CONTENT_SCRIPT,
        currentUrl: window.location.href,
        storage: new ChromeStorageAdapter()
      });

      const allContentFeatures = instantiateAllFeatures();
      contentManager.registerMany(allContentFeatures);

      await contentManager.initializeAll();
      console.log('[NSV] Content script features initialized');

      (window as any).__NSV_CONTENT_MANAGER__ = contentManager;
    } catch (error: any) {
      console.error('[NSV] Failed to initialize content script features:', error);
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

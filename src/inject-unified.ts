/**
 * inject-unified.ts
 * Script d'injection unifié qui utilise le nouveau système de features
 * Remplace l'ancien nosubvod.ts
 * 
 * Ce fichier s'exécute dans le contexte du CONTENT SCRIPT (accès à chrome.*)
 * et injecte les scripts nécessaires dans le contexte de la PAGE
 */

declare const chrome: any;

// ============================================
// IMPORTANT: Injection NON-BLOQUANTE pour ne pas ralentir Twitch
// ============================================

// Fonction d'injection asynchrone avec timeout
async function injectPageScript() {
  try {
    // Configuration pour le patch URL
    const patchUrl = chrome.runtime.getURL('dist/patch_amazonworker.js');
    const pageScriptUrl = chrome.runtime.getURL('dist/page-script-entry.js');
    
    // Injecter immédiatement le script de page
    const target = document.head || document.documentElement;
    const pageScript = document.createElement('script');
    pageScript.src = pageScriptUrl;
    pageScript.setAttribute('data-patch-url', patchUrl);
    pageScript.onload = () => pageScript.remove();
    
    // Insérer au début du document
    if (target.firstChild) {
      target.insertBefore(pageScript, target.firstChild);
    } else {
      target.appendChild(pageScript);
    }

    console.log('[NSV] Page script injected');

    // Charger les settings en arrière-plan (sans bloquer)
    chrome.storage.local.get('chatCustomization', (result: any) => {
      if (chrome.runtime.lastError) {
        console.warn('[NSV] Could not load chat settings:', chrome.runtime.lastError);
        return;
      }
      
      if (result.chatCustomization) {
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
        console.log('[NSV] Chat settings loaded');
      }
    });
  } catch (error) {
    console.error('[NSV] Error injecting page script:', error);
  }
}

// Injecter immédiatement sans attendre
injectPageScript();

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

// Attendre que le DOM soit prêt avant d'initialiser les features
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeContentFeatures);
} else {
  initializeContentFeatures();
}

console.log('[NSV] Unified injection system loaded');

export {};

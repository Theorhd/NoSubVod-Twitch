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
// IMPORTANT: Charger les settings AVANT d'injecter le page script
// ============================================
chrome.storage.local.get('chatCustomization', (result: any) => {
  try {
    // Préparer les settings pour le page script
    if (result.chatCustomization) {
      const settings = { ...result.chatCustomization };
      if (settings.myBadgeText && settings.myBadgeText.startsWith('assets/')) {
        settings.myBadgeText = chrome.runtime.getURL(settings.myBadgeText);
      }
      (window as any).NSV_SETTINGS = settings;
      console.log('[NSV] Chat settings preloaded for page script');
    }
    
    // Configuration pour le patch URL - DOIT être fait AVANT l'injection du page script
    const patchUrl = chrome.runtime.getURL('dist/patch_amazonworker.js');
    
    // Solution 1 : Passer le patch_url via un attribut data sur le script
    // Cela évite la violation CSP (pas de script inline)
    const target = document.head || document.documentElement;
    
    // Injecter le script de page unifié avec l'URL en attribut data
    const pageScriptUrl = chrome.runtime.getURL('dist/page-script-entry.js');
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

    console.log('[NSV] Page script injected with patch URL:', patchUrl);
  } catch (error) {
    console.error('[NSV] Error injecting page script:', error);
  }
});

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
// Fait de manière asynchrone après que la page soit chargée
// ============================================
setTimeout(async () => {
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
}, 100); // Petit délai pour ne pas bloquer le chargement initial

console.log('[NSV] Unified injection system loaded');

export {};

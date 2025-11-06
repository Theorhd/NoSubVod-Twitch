/**
 * content-script-entry.ts
 * Point d'entrée pour les content scripts
 * Initialise les features qui s'exécutent dans le contexte content script
 */

import { FeatureManager, FeatureContext } from './core';
import { ChromeStorageAdapter } from './core/storage-adapter';
import { instantiateAllFeatures } from './feature-registry';

// Initialiser le gestionnaire de features pour le contexte content script
const manager = new FeatureManager({
  context: FeatureContext.CONTENT_SCRIPT,
  currentUrl: window.location.href,
  storage: new ChromeStorageAdapter()
});

// Enregistrer toutes les features du registre (elles seront filtrées par contexte automatiquement)
const allFeatures = instantiateAllFeatures();
manager.registerMany(allFeatures);

// Initialiser toutes les features
manager.initializeAll().then(() => {
  console.log('[NSV] Content script features initialized');
}).catch((error: any) => {
  console.error('[NSV] Failed to initialize content script features:', error);
});

// Gérer les changements d'URL (SPA)
(() => {
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
})();

// Exposer le manager globalement pour le debug
(window as any).__NSV_CONTENT_MANAGER__ = manager;

export {};

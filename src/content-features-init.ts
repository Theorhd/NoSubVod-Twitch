/**
 * content-features-init.ts
 * Initialise les features qui s'exécutent dans le contexte du content script
 */

import { FeatureManager, FeatureContext } from './core';
import { ChromeStorageAdapter } from './core/storage-adapter';
import { instantiateAllFeatures } from './feature-registry';

// Initialiser le gestionnaire de features pour le contexte content script
const contentManager = new FeatureManager({
  context: FeatureContext.CONTENT_SCRIPT,
  currentUrl: window.location.href,
  storage: new ChromeStorageAdapter()
});

// Enregistrer toutes les features du registre (elles seront filtrées par contexte automatiquement)
const allContentFeatures = instantiateAllFeatures();
contentManager.registerMany(allContentFeatures);

// Initialiser toutes les features
contentManager.initializeAll().then(() => {
  console.log('[NSV] Content script features initialized');
}).catch((error: any) => {
  console.error('[NSV] Failed to initialize content script features:', error);
});

// Exposer le manager globalement pour le debug
(window as any).__NSV_CONTENT_MANAGER__ = contentManager;

export {};

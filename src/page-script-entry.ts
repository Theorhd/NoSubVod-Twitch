/**
 * page-script-entry.ts
 * Point d'entrée pour les scripts de page (injected scripts)
 * Initialise les features qui s'exécutent dans le contexte de la page
 */

import { FeatureManager, FeatureContext } from './core';
import { instantiateAllFeatures } from './feature-registry';

// Récupérer le patch_url depuis l'attribut data du script
const currentScript = document.currentScript as HTMLScriptElement;
if (currentScript) {
  const patchUrl = currentScript.getAttribute('data-patch-url');
  if (patchUrl) {
    (window as any).patch_url = patchUrl;
    console.log('[NSV] Patch URL loaded from script attribute:', patchUrl);
  } else {
    console.warn('[NSV] No patch URL found in script attribute');
  }
}

// Initialiser le gestionnaire de features pour le contexte page script
const manager = new FeatureManager({
  context: FeatureContext.PAGE_SCRIPT,
  currentUrl: window.location.href
});

// Enregistrer toutes les features du registre (elles seront filtrées par contexte automatiquement)
const allFeatures = instantiateAllFeatures();
console.log('[NSV] All features from registry:', allFeatures.map(f => ({
  id: f.getId(),
  context: f.getConfig().context,
  urlPatterns: f.getConfig().urlPatterns
})));
manager.registerMany(allFeatures);
console.log('[NSV] Registered features:', manager.getAllFeatures().map(f => f.getId()));

// Initialiser toutes les features
manager.initializeAll().then(() => {
  console.log('[NSV] Page script features initialized');
}).catch((error: any) => {
  console.error('[NSV] Failed to initialize page script features:', error);
});

// Exposer le manager globalement pour le debug et l'accès depuis le bridge
(window as any).__NSV_PAGE_MANAGER__ = manager;

export {};

/**
 * feature-test-helper.ts
 * Utilitaires pour tester les features dans la console du navigateur
 */

import { FeatureManager } from './core/FeatureManager';

declare global {
  interface Window {
    __NSV_PAGE_MANAGER__?: FeatureManager;
    __NSV_CONTENT_MANAGER__?: FeatureManager;
    NSV: typeof NSV;
  }
}

/**
 * Namespace pour les utilitaires de test NoSubVod
 * Accessible via window.NSV dans la console
 */
export const NSV = {
  /**
   * Récupère le FeatureManager du page script
   */
  getPageManager(): FeatureManager | undefined {
    return window.__NSV_PAGE_MANAGER__;
  },

  /**
   * Récupère le FeatureManager du content script
   */
  getContentManager(): FeatureManager | undefined {
    return window.__NSV_CONTENT_MANAGER__;
  },

  /**
   * Liste toutes les features avec leur état
   */
  listFeatures(managerType: 'page' | 'content' = 'page'): void {
    const manager = managerType === 'page' 
      ? this.getPageManager() 
      : this.getContentManager();

    if (!manager) {
      console.error(`[NSV] ${managerType} manager not found`);
      return;
    }

    const features = manager.getAllFeatures();
    
    console.group(`📋 Features (${features.length} total)`);
    features.forEach(feature => {
      const config = feature.getConfig();
      const status = feature.isEnabled() ? '✅ Enabled' : '❌ Disabled';
      
      console.group(`${status} ${config.name} (${config.id})`);
      console.log('Description:', config.description);
      console.log('Version:', config.version);
      console.log('Context:', config.context);
      console.log('Dependencies:', config.dependencies || 'None');
      console.groupEnd();
    });
    console.groupEnd();
  },

  /**
   * Liste uniquement les features activées
   */
  listEnabled(managerType: 'page' | 'content' = 'page'): void {
    const manager = managerType === 'page' 
      ? this.getPageManager() 
      : this.getContentManager();

    if (!manager) {
      console.error(`[NSV] ${managerType} manager not found`);
      return;
    }

    const features = manager.getEnabledFeatures();
    
    console.group(`✅ Enabled Features (${features.length})`);
    features.forEach(feature => {
      const config = feature.getConfig();
      console.log(`• ${config.name} (${config.id})`);
    });
    console.groupEnd();
  },

  /**
   * Active ou désactive une feature
   */
  async toggleFeature(
    featureId: string, 
    enabled?: boolean,
    managerType: 'page' | 'content' = 'page'
  ): Promise<void> {
    const manager = managerType === 'page' 
      ? this.getPageManager() 
      : this.getContentManager();

    if (!manager) {
      console.error(`[NSV] ${managerType} manager not found`);
      return;
    }

    const feature = manager.getFeature(featureId);
    if (!feature) {
      console.error(`[NSV] Feature '${featureId}' not found`);
      return;
    }

    const newState = enabled !== undefined ? enabled : !feature.isEnabled();
    
    try {
      await manager.setFeatureEnabled(featureId, newState);
      console.log(`✅ Feature '${featureId}' ${newState ? 'enabled' : 'disabled'}`);
    } catch (error) {
      console.error(`❌ Failed to toggle feature '${featureId}':`, error);
    }
  },

  /**
   * Désactive toutes les features
   */
  async disableAll(managerType: 'page' | 'content' = 'page'): Promise<void> {
    const manager = managerType === 'page' 
      ? this.getPageManager() 
      : this.getContentManager();

    if (!manager) {
      console.error(`[NSV] ${managerType} manager not found`);
      return;
    }

    const features = manager.getAllFeatures();
    
    console.log(`⏸️ Disabling ${features.length} features...`);
    
    for (const feature of features) {
      if (feature.isEnabled()) {
        await manager.setFeatureEnabled(feature.getId(), false);
      }
    }
    
    console.log('✅ All features disabled');
  },

  /**
   * Active toutes les features
   */
  async enableAll(managerType: 'page' | 'content' = 'page'): Promise<void> {
    const manager = managerType === 'page' 
      ? this.getPageManager() 
      : this.getContentManager();

    if (!manager) {
      console.error(`[NSV] ${managerType} manager not found`);
      return;
    }

    const features = manager.getAllFeatures();
    
    console.log(`▶️ Enabling ${features.length} features...`);
    
    for (const feature of features) {
      if (!feature.isEnabled()) {
        await manager.setFeatureEnabled(feature.getId(), true);
      }
    }
    
    console.log('✅ All features enabled');
  },

  /**
   * Recharge toutes les features
   */
  async reload(managerType: 'page' | 'content' = 'page'): Promise<void> {
    const manager = managerType === 'page' 
      ? this.getPageManager() 
      : this.getContentManager();

    if (!manager) {
      console.error(`[NSV] ${managerType} manager not found`);
      return;
    }

    console.log('🔄 Reloading features...');
    await manager.reload();
    console.log('✅ Features reloaded');
  },

  /**
   * Affiche les informations détaillées d'une feature
   */
  getFeatureInfo(featureId: string, managerType: 'page' | 'content' = 'page'): void {
    const manager = managerType === 'page' 
      ? this.getPageManager() 
      : this.getContentManager();

    if (!manager) {
      console.error(`[NSV] ${managerType} manager not found`);
      return;
    }

    const feature = manager.getFeature(featureId);
    if (!feature) {
      console.error(`[NSV] Feature '${featureId}' not found`);
      return;
    }

    const config = feature.getConfig();
    
    console.group(`📦 Feature: ${config.name}`);
    console.log('ID:', config.id);
    console.log('Description:', config.description);
    console.log('Version:', config.version);
    console.log('Status:', feature.isEnabled() ? '✅ Enabled' : '❌ Disabled');
    console.log('Context:', config.context);
    console.log('URL Patterns:', config.urlPatterns || 'All URLs');
    console.log('Dependencies:', config.dependencies || 'None');
    console.log('Enabled by default:', config.enabledByDefault);
    console.groupEnd();
  },

  /**
   * Affiche l'aide
   */
  help(): void {
    console.group('🚀 NoSubVod Feature Test Helper');
    console.log('Available commands:');
    console.log('');
    console.log('NSV.listFeatures()               - Liste toutes les features');
    console.log('NSV.listEnabled()                - Liste les features activées');
    console.log('NSV.toggleFeature(id)            - Active/désactive une feature');
    console.log('NSV.toggleFeature(id, true)      - Active une feature');
    console.log('NSV.toggleFeature(id, false)     - Désactive une feature');
    console.log('NSV.enableAll()                  - Active toutes les features');
    console.log('NSV.disableAll()                 - Désactive toutes les features');
    console.log('NSV.reload()                     - Recharge toutes les features');
    console.log('NSV.getFeatureInfo(id)           - Infos détaillées d\'une feature');
    console.log('');
    console.log('Exemples:');
    console.log('  NSV.listFeatures()');
    console.log('  NSV.toggleFeature("vod-unlocker", false)');
    console.log('  NSV.getFeatureInfo("chat-customizer")');
    console.groupEnd();
  }
};

// Exposer globalement
if (typeof window !== 'undefined') {
  window.NSV = NSV;
  console.log('[NSV] Test helper loaded. Type NSV.help() for available commands.');
}

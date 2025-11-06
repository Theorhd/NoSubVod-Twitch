/**
 * FeatureManager.ts
 * Gestionnaire centralisé de toutes les features de l'extension
 */

import { Feature, FeatureConfig, FeatureContext } from './Feature';

export interface FeatureManagerConfig {
  /** Contexte d'exécution actuel */
  context: FeatureContext;
  
  /** URL actuelle (optionnel, utilisé pour filtrer les features) */
  currentUrl?: string;
  
  /** Stockage personnalisé (optionnel) */
  storage?: FeatureStorage;
}

export interface FeatureStorage {
  get(key: string): Promise<any>;
  set(key: string, value: any): Promise<void>;
  remove(key: string): Promise<void>;
}

export class FeatureManager {
  private features: Map<string, Feature> = new Map();
  private config: FeatureManagerConfig;
  private initialized: boolean = false;

  constructor(config: FeatureManagerConfig) {
    this.config = config;
  }

  /**
   * Enregistre une nouvelle feature
   */
  public register(feature: Feature): void {
    const id = feature.getId();
    
    if (this.features.has(id)) {
      console.warn(`[NSV] Feature ${id} is already registered`);
      return;
    }

    // Vérifier si la feature peut s'exécuter dans ce contexte
    if (!feature.canRunInContext(this.config.context)) {
      console.log(`[NSV] Feature ${id} skipped (wrong context: ${this.config.context})`);
      return;
    }

    // Vérifier si la feature doit s'exécuter sur cette URL
    if (this.config.currentUrl && !feature.shouldRunOnUrl(this.config.currentUrl)) {
      console.log(`[NSV] Feature ${id} skipped (URL pattern mismatch)`);
      return;
    }

    this.features.set(id, feature);
    console.log(`[NSV] Feature ${id} registered`);
  }

  /**
   * Enregistre plusieurs features
   */
  public registerMany(features: Feature[]): void {
    features.forEach(feature => this.register(feature));
  }

  /**
   * Récupère une feature par son ID
   */
  public getFeature(id: string): Feature | undefined {
    return this.features.get(id);
  }

  /**
   * Récupère toutes les features enregistrées
   */
  public getAllFeatures(): Feature[] {
    return Array.from(this.features.values());
  }

  /**
   * Récupère toutes les features activées
   */
  public getEnabledFeatures(): Feature[] {
    return this.getAllFeatures().filter(f => f.isEnabled());
  }

  /**
   * Initialise toutes les features enregistrées
   */
  public async initializeAll(): Promise<void> {
    if (this.initialized) {
      console.warn('[NSV] FeatureManager is already initialized');
      return;
    }

    console.log(`[NSV] Initializing ${this.features.size} features in context: ${this.config.context}`);

    // Charger l'état activé/désactivé depuis le storage si disponible
    if (this.config.storage) {
      await this.loadFeatureSettings();
    }

    // Résoudre les dépendances et initialiser dans l'ordre
    const orderedFeatures = this.resolveDependencies();
    
    for (const feature of orderedFeatures) {
      try {
        await feature.initialize();
      } catch (error) {
        console.error(`[NSV] Failed to initialize feature ${feature.getId()}:`, error);
      }
    }

    this.initialized = true;
    console.log('[NSV] All features initialized');
  }

  /**
   * Résout les dépendances entre features et retourne l'ordre d'initialisation
   */
  private resolveDependencies(): Feature[] {
    const resolved: Feature[] = [];
    const unresolved = new Set(this.features.keys());

    const resolve = (featureId: string, resolving: Set<string> = new Set()): void => {
      if (resolved.find(f => f.getId() === featureId)) {
        return; // Déjà résolu
      }

      const feature = this.features.get(featureId);
      if (!feature) {
        return;
      }

      if (resolving.has(featureId)) {
        throw new Error(`Circular dependency detected: ${Array.from(resolving).join(' -> ')} -> ${featureId}`);
      }

      resolving.add(featureId);

      // Résoudre les dépendances d'abord
      const deps = feature.getConfig().dependencies || [];
      for (const depId of deps) {
        if (!this.features.has(depId)) {
          console.warn(`[NSV] Feature ${featureId} depends on ${depId} which is not registered`);
          continue;
        }
        resolve(depId, new Set(resolving));
      }

      resolving.delete(featureId);
      resolved.push(feature);
      unresolved.delete(featureId);
    };

    // Résoudre toutes les features
    Array.from(unresolved).forEach(id => resolve(id));

    return resolved;
  }

  /**
   * Charge l'état activé/désactivé des features depuis le storage
   */
  private async loadFeatureSettings(): Promise<void> {
    if (!this.config.storage) return;

    try {
      const featureSettings = await this.config.storage.get('featureSettings') || {};
      
      for (const [id, feature] of this.features.entries()) {
        if (id in featureSettings) {
          feature.setEnabled(featureSettings[id]);
        }
      }
      
      console.log('[NSV] Feature settings loaded from storage:', featureSettings);
    } catch (error) {
      console.error('[NSV] Failed to load feature settings:', error);
    }
  }

  /**
   * Sauvegarde l'état activé/désactivé des features dans le storage
   */
  private async saveFeatureSettings(): Promise<void> {
    if (!this.config.storage) return;

    try {
      const featureSettings: Record<string, boolean> = {};
      
      for (const [id, feature] of this.features.entries()) {
        featureSettings[id] = feature.isEnabled();
      }
      
      await this.config.storage.set('featureSettings', featureSettings);
      console.log('[NSV] Feature settings saved to storage');
    } catch (error) {
      console.error('[NSV] Failed to save feature settings:', error);
    }
  }

  /**
   * Active ou désactive une feature
   */
  public async setFeatureEnabled(id: string, enabled: boolean): Promise<void> {
    const feature = this.features.get(id);
    
    if (!feature) {
      throw new Error(`Feature ${id} not found`);
    }

    feature.setEnabled(enabled);
    await this.saveFeatureSettings();
    
    console.log(`[NSV] Feature ${id} ${enabled ? 'enabled' : 'disabled'}`);
  }

  /**
   * Détruit toutes les features
   */
  public async destroyAll(): Promise<void> {
    console.log('[NSV] Destroying all features');

    for (const feature of this.features.values()) {
      try {
        await feature.destroy();
      } catch (error) {
        console.error(`[NSV] Failed to destroy feature ${feature.getId()}:`, error);
      }
    }

    this.features.clear();
    this.initialized = false;
    
    console.log('[NSV] All features destroyed');
  }

  /**
   * Recharge toutes les features (utile lors de changement d'URL en SPA)
   */
  public async reload(newUrl?: string): Promise<void> {
    if (newUrl) {
      this.config.currentUrl = newUrl;
    }

    await this.destroyAll();
    await this.initializeAll();
  }
}

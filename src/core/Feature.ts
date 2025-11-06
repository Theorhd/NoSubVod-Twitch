/**
 * Feature.ts
 * Interface de base pour toutes les fonctionnalités modulaires de l'extension
 */

export interface FeatureConfig {
  /** Identifiant unique de la feature */
  id: string;
  
  /** Nom lisible de la feature */
  name: string;
  
  /** Description de la feature */
  description: string;
  
  /** Version de la feature */
  version: string;
  
  /** Feature activée par défaut */
  enabledByDefault: boolean;
  
  /** Contexte d'exécution requis */
  context: FeatureContext[];
  
  /** Dépendances vers d'autres features */
  dependencies?: string[];
  
  /** URL patterns où la feature doit s'exécuter */
  urlPatterns?: RegExp[];
}

export enum FeatureContext {
  /** Script de contenu (content script) */
  CONTENT_SCRIPT = 'content_script',
  
  /** Script de page injecté (page context) */
  PAGE_SCRIPT = 'page_script',
  
  /** Service worker en arrière-plan */
  BACKGROUND = 'background',
  
  /** Popup de l'extension */
  POPUP = 'popup',
  
  /** Page de téléchargement */
  DOWNLOAD_PAGE = 'download_page'
}

/**
 * Classe abstraite de base pour toutes les features
 */
export abstract class Feature {
  protected config: FeatureConfig;
  protected enabled: boolean = false;
  protected initialized: boolean = false;

  constructor(config: FeatureConfig) {
    this.config = config;
    this.enabled = config.enabledByDefault;
  }

  /**
   * Récupère la configuration de la feature
   */
  public getConfig(): FeatureConfig {
    return { ...this.config };
  }

  /**
   * Récupère l'ID de la feature
   */
  public getId(): string {
    return this.config.id;
  }

  /**
   * Vérifie si la feature est activée
   */
  public isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Active ou désactive la feature
   */
  public setEnabled(enabled: boolean): void {
    const wasEnabled = this.enabled;
    this.enabled = enabled;
    
    if (enabled && !wasEnabled && this.initialized) {
      this.onEnable();
    } else if (!enabled && wasEnabled && this.initialized) {
      this.onDisable();
    }
  }

  /**
   * Vérifie si la feature peut s'exécuter dans le contexte actuel
   */
  public canRunInContext(context: FeatureContext): boolean {
    return this.config.context.includes(context);
  }

  /**
   * Vérifie si la feature doit s'exécuter sur l'URL actuelle
   */
  public shouldRunOnUrl(url: string): boolean {
    if (!this.config.urlPatterns || this.config.urlPatterns.length === 0) {
      return true; // Pas de restriction d'URL
    }
    
    return this.config.urlPatterns.some(pattern => pattern.test(url));
  }

  /**
   * Initialise la feature
   * À appeler une seule fois au démarrage
   */
  public async initialize(): Promise<void> {
    if (this.initialized) {
      console.warn(`[NSV] Feature ${this.config.id} is already initialized`);
      return;
    }

    try {
      await this.onInitialize();
      this.initialized = true;
      
      if (this.enabled) {
        await this.onEnable();
      }
      
      console.log(`[NSV] Feature ${this.config.id} initialized successfully`);
    } catch (error) {
      console.error(`[NSV] Failed to initialize feature ${this.config.id}:`, error);
      throw error;
    }
  }

  /**
   * Nettoie les ressources de la feature
   */
  public async destroy(): Promise<void> {
    if (this.enabled) {
      await this.onDisable();
    }
    
    await this.onDestroy();
    this.initialized = false;
    
    console.log(`[NSV] Feature ${this.config.id} destroyed`);
  }

  /**
   * Méthode appelée lors de l'initialisation de la feature
   * À implémenter par les classes dérivées
   */
  protected abstract onInitialize(): Promise<void>;

  /**
   * Méthode appelée lorsque la feature est activée
   * À implémenter par les classes dérivées
   */
  protected abstract onEnable(): Promise<void>;

  /**
   * Méthode appelée lorsque la feature est désactivée
   * À implémenter par les classes dérivées
   */
  protected abstract onDisable(): Promise<void>;

  /**
   * Méthode appelée lors de la destruction de la feature
   * À implémenter par les classes dérivées
   */
  protected abstract onDestroy(): Promise<void>;

  /**
   * Enregistre un message de log préfixé avec l'ID de la feature
   */
  protected log(...args: any[]): void {
    console.log(`[NSV:${this.config.id}]`, ...args);
  }

  /**
   * Enregistre une erreur préfixée avec l'ID de la feature
   */
  protected logError(...args: any[]): void {
    console.error(`[NSV:${this.config.id}]`, ...args);
  }
}

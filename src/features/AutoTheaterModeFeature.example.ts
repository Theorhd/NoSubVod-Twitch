/**
 * AutoTheaterModeFeature.ts
 * EXEMPLE DE NOUVELLE FEATURE
 * 
 * Cette feature active automatiquement le mode théâtre sur les pages de VOD/stream
 * Démontre comment créer une nouvelle feature facilement
 */

import { Feature, FeatureConfig, FeatureContext } from '../core/Feature';

export class AutoTheaterModeFeature extends Feature {
  private observer: MutationObserver | null = null;
  private activated: boolean = false;

  constructor() {
    const config: FeatureConfig = {
      id: 'auto-theater-mode',
      name: 'Auto Theater Mode',
      description: 'Active automatiquement le mode théâtre sur les VODs et streams',
      version: '1.0.0',
      enabledByDefault: false, // Désactivé par défaut (nouvelle feature expérimentale)
      context: [FeatureContext.PAGE_SCRIPT],
      urlPatterns: [
        /^https?:\/\/(www\.)?twitch\.tv\/videos\//,  // Pages VOD
        /^https?:\/\/(www\.)?twitch\.tv\/[^/]+$/      // Pages de stream
      ],
    };
    super(config);
  }

  protected async onInitialize(): Promise<void> {
    this.log('Initializing auto theater mode');
  }

  protected async onEnable(): Promise<void> {
    this.log('Enabling auto theater mode');
    this.activateTheaterMode();
    this.startObserver();
  }

  protected async onDisable(): Promise<void> {
    this.log('Disabling auto theater mode');
    this.stopObserver();
  }

  protected async onDestroy(): Promise<void> {
    this.stopObserver();
  }

  /**
   * Active le mode théâtre en cliquant sur le bouton approprié
   */
  private activateTheaterMode(): void {
    // Éviter d'activer plusieurs fois
    if (this.activated) {
      return;
    }

    // Chercher le bouton du mode théâtre
    const theaterButton = this.findTheaterButton();
    
    if (theaterButton) {
      // Vérifier si le mode théâtre n'est pas déjà actif
      const isActive = theaterButton.getAttribute('aria-label')?.toLowerCase().includes('default');
      
      if (!isActive) {
        this.log('Activating theater mode');
        theaterButton.click();
        this.activated = true;
      } else {
        this.log('Theater mode already active');
        this.activated = true;
      }
    } else {
      this.log('Theater button not found yet, will retry');
    }
  }

  /**
   * Trouve le bouton du mode théâtre
   */
  private findTheaterButton(): HTMLElement | null {
    // Twitch utilise data-a-target pour identifier les boutons
    const button = document.querySelector('[data-a-target="player-theatre-mode-button"]') as HTMLElement;
    
    if (button) {
      return button;
    }

    // Fallback : chercher par aria-label
    const buttons = document.querySelectorAll('button[aria-label*="Theater"]');
    if (buttons.length > 0) {
      return buttons[0] as HTMLElement;
    }

    return null;
  }

  /**
   * Observe le DOM pour détecter l'apparition du bouton de mode théâtre
   */
  private startObserver(): void {
    if (!document.body) {
      setTimeout(() => this.startObserver(), 100);
      return;
    }

    this.observer = new MutationObserver(() => {
      if (!this.activated) {
        this.activateTheaterMode();
      }
    });

    this.observer.observe(document.body, {
      childList: true,
      subtree: true
    });

    this.log('Observer started');
  }

  /**
   * Arrête l'observation du DOM
   */
  private stopObserver(): void {
    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
      this.activated = false;
      this.log('Observer stopped');
    }
  }
}

// Pour activer cette feature, ajoutez-la dans feature-registry.ts :
/*
import { AutoTheaterModeFeature } from './features';

export const FEATURE_REGISTRY: FeatureDefinition[] = [
  // ... autres features
  {
    featureClass: AutoTheaterModeFeature,
    category: 'ui',
    tags: ['theater', 'ui', 'automation', 'quality-of-life']
  },
];
*/

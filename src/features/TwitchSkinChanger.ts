/**
 * TwitchSkinChanger.ts
 * Feature pour personnaliser les couleurs de l'interface Twitch
 */

declare const chrome: any;

import { Feature, FeatureConfig, FeatureContext } from '../core/Feature';

export interface SkinColors {
  /** Couleur principale (sidebar, header) */
  primary: string;
  /** Couleur secondaire (hover, accent) */
  secondary: string;
  /** Couleur d'arrière-plan */
  background: string;
  /** Couleur du texte */
  text: string;
  /** Couleur des liens */
  link: string;
  /** Couleur des boutons */
  button: string;
}

export class TwitchSkinChanger extends Feature {
  private styleElement: HTMLStyleElement | null = null;
  private currentColors: SkinColors | null = null;

  constructor() {
    const config: FeatureConfig = {
      id: 'twitch-skin-changer',
      name: 'Twitch Skin Changer',
      description: 'Personnalise les couleurs de l\'interface Twitch',
      version: '1.0.0',
      enabledByDefault: false,
      context: [FeatureContext.CONTENT_SCRIPT],
      urlPatterns: [/^https?:\/\/(www\.)?twitch\.tv\//],
    };
    super(config);
  }

  protected async onInitialize(): Promise<void> {
    this.log('Initializing Twitch Skin Changer');
    
    // Charger les couleurs depuis le storage
    await this.loadColors();
    
    // Charger l'état activé/désactivé
    try {
      const result = await chrome.storage.local.get('twitchSkinEnabled');
      if (result.twitchSkinEnabled === true) {
        // La feature doit être activée
        this.setEnabled(true);
      }
    } catch (error) {
      this.logError('Failed to load enabled state:', error);
    }
  }

  protected async onEnable(): Promise<void> {
    this.log('Enabling Twitch Skin Changer');
    
    // Attendre que le DOM soit prêt
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => {
        if (this.currentColors) {
          this.applyColors(this.currentColors);
        }
      });
    } else {
      if (this.currentColors) {
        this.applyColors(this.currentColors);
      } else {
        this.log('No colors to apply yet');
      }
    }
    
    // Écouter les changements de couleurs depuis la popup
    this.listenForColorChanges();
  }

  protected async onDisable(): Promise<void> {
    this.log('Disabling Twitch Skin Changer');
    this.removeColors();
  }

  protected async onDestroy(): Promise<void> {
    this.removeColors();
  }

  private async loadColors(): Promise<void> {
    try {
      const result = await chrome.storage.local.get('twitchSkinColors');
      if (result.twitchSkinColors) {
        this.currentColors = result.twitchSkinColors;
        this.log('Loaded colors:', this.currentColors);
      }
    } catch (error) {
      this.logError('Failed to load colors:', error);
    }
  }

  private listenForColorChanges(): void {
    chrome.runtime.onMessage.addListener((request: any, sender: any, sendResponse: any) => {
      if (request.action === 'updateTwitchSkin') {
        this.currentColors = request.colors;
        this.applyColors(request.colors);
        sendResponse({ success: true });
      }
      return true;
    });
  }

  private applyColors(colors: SkinColors): void {
    this.log('Applying colors:', colors);
    
    // Supprimer l'ancien style si existe
    this.removeColors();
    
    // Créer un nouveau style element
    this.styleElement = document.createElement('style');
    this.styleElement.id = 'nsv-twitch-skin';
    
    // Générer le CSS avec les couleurs personnalisées
    this.styleElement.textContent = `
      /* NSV Twitch Skin Changer - Custom Colors */
      
      /* ===== PRIORITÉ ABSOLUE : PLAYER TOUJOURS TRANSPARENT ===== */
      .video-player,
      .video-player *,
      .video-player__container,
      .video-player__container *,
      .video-player__overlay,
      .video-player__overlay *,
      [data-a-player-type],
      [data-a-player-type] *,
      .persistent-player,
      .persistent-player *,
      .video-ref,
      video,
      [data-a-target="video-player"],
      [data-a-target="video-player"] *,
      .player-overlay-background,
      .content-overlay-gate--video-player {
        background-color: transparent !important;
        background: transparent !important;
      }
      
      /* Sidebar & Navigation */
      .side-nav,
      .side-nav-section,
      .side-nav-card,
      [data-a-target="side-nav-header"],
      .side-bar-contents {
        background-color: ${colors.primary} !important;
      }
      
      /* Top Navigation */
      .top-nav,
      nav[aria-label="Primary"],
      .top-nav__menu {
        background-color: ${colors.primary} !important;
      }
      
      /* Hover states */
      .side-nav-card:hover,
      .side-nav-card__live-status:hover,
      .tw-interactive:hover,
      .tw-button:hover {
        background-color: ${colors.secondary} !important;
      }
      
      /* Background - SAUF PLAYER */
      body:not(.video-player):not(.video-player *),
      .tw-root--theme-dark,
      .twilight-root,
      [data-a-target="home-live-carousel"],
      .stream-chat,
      .chat-shell,
      .chat-input,
      .channel-root,
      .hoYUtL {
        background-color: ${colors.background} !important;
      }
      
      /* Cards & Panels */
      .tw-card,
      .tw-elevation-1,
      .tw-elevation-2,
      .stream-chat-header,
      .chat-shell__expanded,
      .chat-room,
      .tw-pd-1,
      .tw-pd-2 {
        background-color: ${colors.background} !important;
        border-color: ${colors.secondary} !important;
      }
      
      /* Text */
      body,
      .tw-root,
      p,
      h1, h2, h3, h4, h5, h6,
      span,
      .tw-title,
      .tw-font-size-5,
      .chat-line__message,
      .text-fragment {
        color: ${colors.text} !important;
      }
      
      /* Links */
      a,
      .tw-link,
      .channel-info-content a,
      .chat-line__username {
        color: ${colors.link} !important;
      }
      
      /* Buttons */
      .tw-button,
      button,
      [data-a-target="follow-button"],
      [data-a-target="subscribe-button"],
      .chat-input__buttons-container button {
        background-color: ${colors.button} !important;
        border-color: ${colors.button} !important;
        color: ${colors.text} !important;
      }
      
      /* Buttons primary */
      .tw-button--primary,
      .tw-core-button--primary {
        background-color: ${colors.secondary} !important;
      }
      
      /* Input fields */
      .tw-input,
      input[type="text"],
      textarea,
      .chat-input textarea {
        background-color: ${colors.background} !important;
        border-color: ${colors.secondary} !important;
        color: ${colors.text} !important;
      }
      
      /* Scrollbars */
      ::-webkit-scrollbar-track {
        background-color: ${colors.background} !important;
      }
      
      ::-webkit-scrollbar-thumb {
        background-color: ${colors.secondary} !important;
      }
      
      /* Chat badges & emotes - preserve original colors */
      .chat-badge,
      .chat-line__message--emote,
      img[alt*="emote"] {
        filter: none !important;
      }
    `;
    
    document.head.appendChild(this.styleElement);
    this.log('Colors applied successfully');
  }

  private removeColors(): void {
    if (this.styleElement && this.styleElement.parentNode) {
      this.styleElement.parentNode.removeChild(this.styleElement);
      this.styleElement = null;
      this.log('Colors removed');
    }
  }

  /**
   * Méthode publique pour mettre à jour les couleurs
   */
  public async updateColors(colors: SkinColors): Promise<void> {
    this.currentColors = colors;
    
    // Sauvegarder dans le storage
    try {
      await chrome.storage.local.set({ twitchSkinColors: colors });
      this.log('Colors saved to storage');
    } catch (error) {
      this.logError('Failed to save colors:', error);
    }
    
    // Appliquer si la feature est activée
    if (this.isEnabled()) {
      this.applyColors(colors);
    }
  }

  /**
   * Réinitialiser aux couleurs par défaut de Twitch
   */
  public async resetToDefault(): Promise<void> {
    const defaultColors: SkinColors = {
      primary: '#1a1a1d',
      secondary: '#2d2d30',
      background: '#0e0e10',
      text: '#e8e8e8',
      link: '#8b9dc3',
      button: '#4a5568'
    };
    
    await this.updateColors(defaultColors);
  }

  /**
   * Obtenir les couleurs actuelles
   */
  public getCurrentColors(): SkinColors | null {
    return this.currentColors;
  }
}

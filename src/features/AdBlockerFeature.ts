/**
 * AdBlockerFeature.ts
 * Feature qui bloque ou passe automatiquement les publicités Twitch
 * Détecte et masque les overlays publicitaires pour améliorer l'expérience utilisateur
 * 
 * Actuellement non fonctionnel :
 * - Les publicités sur les lives sont intégrées dans le flux du stream. : Comment bloquer ou ne pas récupérer les segements .m3u8 contenant les pubs ?
 * 
 * Pour l'instant la feature détermine bien la présence ou non d'une pub mais n'arrive pas à les bloquer efficacement.
 */


import { Feature, FeatureConfig, FeatureContext } from '../core/Feature';

/**
 * AdBlockerFeature
 * Bloque ou passe automatiquement les publicités Twitch
 */
export class AdBlockerFeature extends Feature {
  private observer: MutationObserver | null = null;
  private adCheckInterval: number | null = null;
  private videoElement: HTMLVideoElement | null = null;
  private lastAdCheck: number = 0;
  private adsBlocked: number = 0;
  private isAdPlaying: boolean = false;
  private adStartTime: number = 0;
  
  // Sélecteurs pour détecter les publicités
  private readonly AD_SELECTORS = {
    // Overlay publicitaire principal
    adOverlay: '[data-a-target="video-ad-label"]',
    // Conteneur de la publicité
    adContainer: '.video-ads__container',
    // Message "Ad in progress"
    adInProgress: '[data-a-target="player-ad-notice"]',
    // Countdown de la publicité
    adCountdown: '.video-ads__countdown',
    // Banner publicitaire
    adBanner: '[data-test-selector="ad-banner"]',
    // Overlay de skip
    skipButton: '[data-a-target="player-overlay-skip-ad"]',
    // Bouton pour fermer les publicités
    adCloseButton: '[data-a-target="player-overlay-ad-label-click"]',
    // Conteneur vidéo principal
    videoContainer: '.video-player__container',
  };

  constructor() {
    const config: FeatureConfig = {
      id: 'ad-blocker',
      name: 'Ad Blocker/Skipper',
      description: '🚫 Bloque ou passe automatiquement les publicités Twitch et masque les overlays publicitaires',
      version: '1.0.0',
      enabledByDefault: true,
      context: [FeatureContext.PAGE_SCRIPT, FeatureContext.CONTENT_SCRIPT],
      // Actif sur toutes les pages de stream/VOD
      urlPatterns: [
        /^https?:\/\/(www\.)?twitch\.tv\/[^/]+$/,           // Streams live
        /^https?:\/\/(www\.)?twitch\.tv\/videos\//,         // VODs
      ],
    };
    super(config);
  }

  protected async onInitialize(): Promise<void> {
    this.log('Initializing Ad Blocker');
    
    // Injecter les styles CSS pour masquer les publicités
    this.injectStyles();
  }

  protected async onEnable(): Promise<void> {
    this.log('Enabling Ad Blocker');
    
    // Démarrer l'observation du DOM
    this.startObserver();
    
    // Vérifier les publicités toutes les 200ms pour une réactivité maximale
    this.adCheckInterval = window.setInterval(() => {
      this.checkAndHandleAds();
    }, 200);
    
    // Patcher le player pour bloquer les publicités à la source
    this.patchTwitchPlayer();
    
    // Vérification initiale
    this.checkAndHandleAds();
  }

  protected async onDisable(): Promise<void> {
    this.log('Disabling Ad Blocker');
    
    // Arrêter l'observer
    this.stopObserver();
    
    // Arrêter l'interval
    if (this.adCheckInterval !== null) {
      clearInterval(this.adCheckInterval);
      this.adCheckInterval = null;
    }
    
    // Retirer les styles
    this.removeStyles();
  }

  protected async onDestroy(): Promise<void> {
    this.videoElement = null;
  }

  // ============================================================
  // Injection de styles CSS
  // ============================================================

  private injectStyles(): void {
    const styleId = 'nsv-ad-blocker-styles';
    
    // Ne pas injecter si déjà présent
    if (document.getElementById(styleId)) {
      return;
    }

    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `
      /* Masquer TOUS les overlays publicitaires avec priorité maximale */
      [data-a-target="video-ad-label"],
      [data-a-target="player-ad-notice"],
      [data-a-target="player-overlay-ad-label-click"],
      .video-ads__container,
      .video-ads__countdown,
      [data-test-selector="ad-banner"],
      .video-ads,
      .ads-wrapper,
      .ad-overlay,
      .ad-banner,
      .tw-ad-badge,
      [class*="ad-overlay"],
      [class*="ad-container"],
      [class*="AdOverlay"],
      [class*="VideoAd"] {
        display: none !important;
        opacity: 0 !important;
        visibility: hidden !important;
        pointer-events: none !important;
        width: 0 !important;
        height: 0 !important;
        position: absolute !important;
        z-index: -9999 !important;
      }
      
      /* Masquer les vidéos publicitaires */
      video[src*="ads"],
      video[src*="commercial"],
      video[src*="ad-"] {
        display: none !important;
        opacity: 0 !important;
      }
      
      /* Forcer l'affichage du contenu principal */
      .video-player,
      .video-player__container {
        display: block !important;
        visibility: visible !important;
      }
      
      /* Message personnalisé pendant le blocage */
      .nsv-ad-blocked-notice {
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        color: #fff;
        padding: 20px 40px;
        border-radius: 12px;
        font-size: 16px;
        font-weight: bold;
        z-index: 999999;
        pointer-events: none;
        animation: nsv-fade-in 0.3s ease-in-out;
        box-shadow: 0 10px 40px rgba(0, 0, 0, 0.3);
        border: 2px solid rgba(255, 255, 255, 0.2);
      }
      
      @keyframes nsv-fade-in {
        from {
          opacity: 0;
          transform: translate(-50%, -50%) scale(0.9);
        }
        to {
          opacity: 1;
          transform: translate(-50%, -50%) scale(1);
        }
      }
    `;
    
    document.head.appendChild(style);
    this.log('Styles injected');
  }

  private removeStyles(): void {
    const style = document.getElementById('nsv-ad-blocker-styles');
    if (style) {
      style.remove();
      this.log('Styles removed');
    }
  }

  // ============================================================
  // Observation du DOM
  // ============================================================

  private startObserver(): void {
    if (!document.body) {
      setTimeout(() => this.startObserver(), 100);
      return;
    }

    this.observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === Node.ELEMENT_NODE) {
            this.processNode(node as Element);
          }
        });
      });
    });

    this.observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['src', 'class', 'data-a-target'],
    });

    this.log('Observer started');
  }

  private stopObserver(): void {
    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
      this.log('Observer stopped');
    }
  }

  private processNode(node: Element): void {
    // Liste des sélecteurs à masquer (exclure le conteneur vidéo)
    const adSelectorsToHide = [
      this.AD_SELECTORS.adOverlay,
      this.AD_SELECTORS.adContainer,
      this.AD_SELECTORS.adInProgress,
      this.AD_SELECTORS.adCountdown,
      this.AD_SELECTORS.adBanner,
      this.AD_SELECTORS.skipButton,
      this.AD_SELECTORS.adCloseButton,
    ];
    
    // Vérifier si c'est un élément publicitaire
    adSelectorsToHide.forEach(selector => {
      if (node.matches && node.matches(selector)) {
        this.hideAdElement(node);
      }
    });
    
    // Vérifier les enfants
    adSelectorsToHide.forEach(selector => {
      const adElements = node.querySelectorAll(selector);
      adElements.forEach(el => this.hideAdElement(el));
    });
  }

  // ============================================================
  // Détection et gestion des publicités
  // ============================================================

  private checkAndHandleAds(): void {
    const now = Date.now();
    
    // Limiter la fréquence des vérifications intensives
    if (now - this.lastAdCheck < 100) {
      return;
    }
    this.lastAdCheck = now;

    try {
      // 1. Masquer les overlays publicitaires
      this.hideAdOverlays();
      
      // 2. Cliquer sur le bouton skip si disponible
      this.clickSkipButton();
      
      // 3. Vérifier et gérer la vidéo
      this.handleVideoAds();
      
      // 4. Détecter les publicités en cours
      if (this.detectAdPlaying()) {
        this.handleAdDetected();
      }
      
    } catch (error) {
      this.logError('Error checking ads', error);
    }
  }

  private hideAdOverlays(): void {
    // Masquer uniquement les éléments publicitaires, PAS le conteneur vidéo principal
    const adSelectorsToHide = [
      this.AD_SELECTORS.adOverlay,
      this.AD_SELECTORS.adContainer,
      this.AD_SELECTORS.adInProgress,
      this.AD_SELECTORS.adCountdown,
      this.AD_SELECTORS.adBanner,
      this.AD_SELECTORS.skipButton,
      this.AD_SELECTORS.adCloseButton,
    ];
    
    adSelectorsToHide.forEach(selector => {
      const elements = document.querySelectorAll(selector);
      elements.forEach(el => this.hideAdElement(el));
    });
  }

  private hideAdElement(element: Element): void {
    const htmlElement = element as HTMLElement;
    
    // Ne JAMAIS cacher le conteneur vidéo principal ou l'élément vidéo
    if (htmlElement.matches('.video-player__container') || 
        htmlElement.matches('.video-player') ||
        htmlElement.tagName === 'VIDEO') {
      return;
    }
    
    if (htmlElement.style.display !== 'none') {
      htmlElement.style.display = 'none';
      htmlElement.style.opacity = '0';
      htmlElement.style.visibility = 'hidden';
      htmlElement.style.pointerEvents = 'none';
      this.log('Hidden ad element:', htmlElement.className);
    }
  }

  private clickSkipButton(): void {
    const skipButton = document.querySelector(this.AD_SELECTORS.skipButton) as HTMLElement;
    if (skipButton && skipButton.offsetParent !== null) {
      skipButton.click();
      this.log('Clicked skip button');
    }
  }

  private handleVideoAds(): void {
    // Trouver l'élément vidéo principal
    if (!this.videoElement) {
      this.videoElement = document.querySelector('video') as HTMLVideoElement;
    }

    if (this.videoElement) {
      // Vérifier si la source contient "ads" ou "commercial"
      const src = this.videoElement.src || this.videoElement.currentSrc || '';
      
      if (src.includes('ads') || src.includes('commercial') || src.includes('ad-')) {
        this.log('Ad video detected in source');
        
        // Plusieurs techniques pour bloquer/accélérer la pub
        try {
          // 1. Accélérer la lecture au maximum
          this.videoElement.playbackRate = 16;
          this.videoElement.muted = true;
          
          // 2. Essayer de sauter à la fin de la vidéo
          if (this.videoElement.duration && isFinite(this.videoElement.duration)) {
            this.videoElement.currentTime = this.videoElement.duration - 0.1;
            this.log('Skipped to end of ad');
          }
          
          // 3. Mettre en pause et cacher
          this.videoElement.pause();
          (this.videoElement as HTMLElement).style.opacity = '0';
          
          this.log('Ad video handled');
        } catch (e) {
          this.logError('Failed to handle ad video', e);
        }
      } else {
        // Restaurer la vitesse normale pour le contenu
        if (this.videoElement.playbackRate > 1) {
          this.videoElement.playbackRate = 1;
          (this.videoElement as HTMLElement).style.opacity = '1';
        }
      }
    }
  }

  private patchTwitchPlayer(): void {
    this.log('Patching Twitch player for ad blocking');
    
    try {
      // Intercepter les requêtes de publicités
      const originalFetch = window.fetch;
      window.fetch = async (...args) => {
        const url = args[0] as string;
        
        // Bloquer les requêtes vers les serveurs de publicités
        if (url && (
          url.includes('/ads/') ||
          url.includes('/commercial/') ||
          url.includes('doubleclick.net') ||
          url.includes('googlesyndication.com') ||
          url.includes('amazon-adsystem.com')
        )) {
          this.log('Blocked ad request:', url);
          // Retourner une réponse vide
          return new Response('{}', {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
          });
        }
        
        return originalFetch.apply(window, args);
      };
      
      // Tenter de patcher les méthodes du player Twitch
      if ((window as any).Twitch && (window as any).Twitch.player) {
        const player = (window as any).Twitch.player;
        
        // Désactiver les publicités dans la configuration du player
        if (player.setPlayerOptions) {
          player.setPlayerOptions({ ads: { enabled: false } });
        }
      }
      
      this.log('Player patched successfully');
    } catch (e) {
      this.logError('Failed to patch player', e);
    }
  }

  private detectAdPlaying(): boolean {
    // Vérifier plusieurs indicateurs de publicité
    const adLabel = document.querySelector(this.AD_SELECTORS.adOverlay);
    const adNotice = document.querySelector(this.AD_SELECTORS.adInProgress);
    const adContainer = document.querySelector(this.AD_SELECTORS.adContainer);
    
    const isAd = !!(adLabel || adNotice || adContainer);
    
    // Détecter le début d'une nouvelle publicité
    if (isAd && !this.isAdPlaying) {
      this.isAdPlaying = true;
      this.adStartTime = Date.now();
      this.adsBlocked++;
      this.log(`New ad detected! Total blocked: ${this.adsBlocked}`);
    } else if (!isAd && this.isAdPlaying) {
      this.isAdPlaying = false;
      const duration = Date.now() - this.adStartTime;
      this.log(`Ad ended after ${(duration / 1000).toFixed(1)}s`);
    }
    
    return isAd;
  }

  private handleAdDetected(): void {
    // Appliquer plusieurs techniques de blocage simultanément
    
    // 1. Masquer visuellement tous les éléments publicitaires
    this.hideAdOverlays();
    
    // 2. Essayer de cliquer sur le bouton skip/close
    this.clickSkipButton();
    this.clickAdCloseButton();
    
    // 3. Gérer la vidéo publicitaire
    this.handleVideoAds();
    
    // 4. Afficher un message personnalisé (si première détection)
    if (this.isAdPlaying && Date.now() - this.adStartTime < 1000) {
      this.showBlockedNotice();
    }
  }

  private clickAdCloseButton(): void {
    const closeButton = document.querySelector(this.AD_SELECTORS.adCloseButton) as HTMLElement;
    if (closeButton && closeButton.offsetParent !== null) {
      closeButton.click();
      this.log('Clicked ad close button');
    }
  }

  private showBlockedNotice(): void {
    const noticeId = 'nsv-ad-blocked-notice';
    
    // Ne pas créer si déjà présent
    if (document.getElementById(noticeId)) {
      return;
    }

    // Trouver le conteneur vidéo
    const videoContainer = document.querySelector('[data-a-target="player-overlay-click-handler"]');
    if (!videoContainer) return;

    // Créer le message
    const notice = document.createElement('div');
    notice.id = noticeId;
    notice.className = 'nsv-ad-blocked-notice';
    notice.textContent = '🚫 Publicité bloquée par NoSubVod';
    
    videoContainer.appendChild(notice);
    
    // Retirer après 3 secondes
    setTimeout(() => {
      notice.remove();
    }, 3000);
  }

  // ============================================================
  // API publique (via NSV.features['ad-blocker'])
  // ============================================================

  /**
   * Force une vérification immédiate des publicités
   */
  public forceAdCheck(): void {
    this.log('Forcing ad check...');
    this.checkAndHandleAds();
  }

  /**
   * Obtient des statistiques sur les publicités bloquées
   */
  public getStats(): { adsBlocked: number; enabled: boolean; currentlyBlocking: boolean } {
    return {
      adsBlocked: this.adsBlocked,
      enabled: this.enabled,
      currentlyBlocking: this.isAdPlaying,
    };
  }
}

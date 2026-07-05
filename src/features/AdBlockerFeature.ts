/**
 * AdBlockerFeature.ts
 * Feature qui bloque ou passe automatiquement les publicités Twitch
 */

import { Feature, FeatureConfig, FeatureContext } from '../core/Feature';

export class AdBlockerFeature extends Feature {
  private adCheckInterval: number | null = null;
  private videoElement: HTMLVideoElement | null = null;
  private adsBlocked: number = 0;
  private isAdPlaying: boolean = false;
  private adStartTime: number = 0;
  
  // Sélecteurs pour détecter les publicités
  private readonly AD_SELECTORS = {
    adOverlay: '[data-a-target="video-ad-label"]',
    adInProgress: '[data-a-target="player-ad-notice"]',
    skipButton: '[data-a-target="player-overlay-skip-ad"]',
    adCloseButton: '[data-a-target="player-overlay-ad-label-click"]',
  };

  constructor() {
    const config: FeatureConfig = {
      id: 'ad-blocker',
      name: 'Ad Blocker/Skipper',
      description: '🚫 Bloque ou passe automatiquement les publicités Twitch',
      version: '1.0.1',
      enabledByDefault: true,
      context: [FeatureContext.PAGE_SCRIPT, FeatureContext.CONTENT_SCRIPT],
      urlPatterns: [
        /^https?:\/\/(www\.)?twitch\.tv\/[^/]+$/,
        /^https?:\/\/(www\.)?twitch\.tv\/videos\//,
      ],
    };
    super(config);
  }

  protected async onInitialize(): Promise<void> {
    this.log('Initializing Ad Blocker');
    this.injectStyles();
  }

  protected async onEnable(): Promise<void> {
    this.log('Enabling Ad Blocker');
    
    // Poll every 500ms to click skip buttons and handle video fast-forward.
    // This replaces the CPU-heavy MutationObserver since CSS handles visibility.
    this.adCheckInterval = globalThis.setInterval(() => {
      this.checkAndHandleAds();
    }, 500);
    
    this.patchTwitchPlayer();
    this.checkAndHandleAds();
  }

  protected async onDisable(): Promise<void> {
    this.log('Disabling Ad Blocker');
    
    if (this.adCheckInterval !== null) {
      clearInterval(this.adCheckInterval);
      this.adCheckInterval = null;
    }
    
    this.removeStyles();
  }

  protected async onDestroy(): Promise<void> {
    this.videoElement = null;
  }

  private injectStyles(): void {
    const styleId = 'nsv-ad-blocker-styles';
    if (document.getElementById(styleId)) return;

    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `
      /* Masquer TOUS les overlays publicitaires */
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
      .tw-ad-badge {
        display: none !important;
        opacity: 0 !important;
        pointer-events: none !important;
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
      }
      
      @keyframes nsv-fade-in {
        from { opacity: 0; transform: translate(-50%, -50%) scale(0.9); }
        to { opacity: 1; transform: translate(-50%, -50%) scale(1); }
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

  private checkAndHandleAds(): void {
    try {
      this.clickSkipButtons();
      this.handleVideoAds();
      
      if (this.detectAdPlaying()) {
        if (this.isAdPlaying && Date.now() - this.adStartTime < 1500) {
          this.showBlockedNotice();
        }
      }
    } catch (error) {
      this.logError('Error checking ads', error);
    }
  }

  private clickSkipButtons(): void {
    const skipBtn = document.querySelector(this.AD_SELECTORS.skipButton) as HTMLElement;
    if (skipBtn && skipBtn.offsetParent !== null) {
      skipBtn.click();
      this.log('Clicked skip button');
    }
    const closeBtn = document.querySelector(this.AD_SELECTORS.adCloseButton) as HTMLElement;
    if (closeBtn && closeBtn.offsetParent !== null) {
      closeBtn.click();
      this.log('Clicked close button');
    }
  }

  private handleVideoAds(): void {
    this.videoElement ??= document.querySelector('video') as HTMLVideoElement;

    if (this.videoElement) {
      const src = this.videoElement.src || this.videoElement.currentSrc || '';
      
      if (src.includes('ads') || src.includes('commercial') || src.includes('ad-')) {
        try {
          if (this.videoElement.playbackRate !== 16) {
            this.videoElement.playbackRate = 16;
            this.videoElement.muted = true;
          }
        } catch (e) {
          this.logError('Failed to handle ad video', e);
        }
      } else if (this.videoElement.playbackRate > 1 && this.videoElement.playbackRate === 16) {
        this.videoElement.playbackRate = 1;
      }
    }
  }

  private patchTwitchPlayer(): void {
    this.log('Patching Twitch player for ad blocking');
    try {
      const originalFetch = globalThis.fetch;
      globalThis.fetch = async (...args) => {
        const url = args[0] as string;
        if (typeof url === 'string' && (
          url.includes('/ads/') ||
          url.includes('/commercial/') ||
          url.includes('doubleclick.net') ||
          url.includes('googlesyndication.com') ||
          url.includes('amazon-adsystem.com')
        )) {
          this.log('Blocked ad request:', url);
          return new Response('{}', {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
          });
        }
        return originalFetch.apply(globalThis, args);
      };
      
      const player = (globalThis as any).Twitch?.player;
      if (player?.setPlayerOptions) {
        player.setPlayerOptions({ ads: { enabled: false } });
      }
    } catch (e) {
      this.logError('Failed to patch player', e);
    }
  }

  private detectAdPlaying(): boolean {
    const isAd = !!(document.querySelector(this.AD_SELECTORS.adOverlay) || document.querySelector(this.AD_SELECTORS.adInProgress));
    
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

  private showBlockedNotice(): void {
    const noticeId = 'nsv-ad-blocked-notice';
    if (document.getElementById(noticeId)) return;

    const videoContainer = document.querySelector('[data-a-target="player-overlay-click-handler"]');
    if (!videoContainer) return;

    const notice = document.createElement('div');
    notice.id = noticeId;
    notice.className = 'nsv-ad-blocked-notice';
    notice.textContent = '🚫 Publicité bloquée par NoSubVod';
    
    videoContainer.appendChild(notice);
    
    setTimeout(() => notice.remove(), 3000);
  }

  public forceAdCheck(): void {
    this.checkAndHandleAds();
  }

  public getStats(): { adsBlocked: number; enabled: boolean; currentlyBlocking: boolean } {
    return {
      adsBlocked: this.adsBlocked,
      enabled: this.enabled,
      currentlyBlocking: this.isAdPlaying,
    };
  }
}

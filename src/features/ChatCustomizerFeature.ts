/**
 * ChatCustomizerFeature.ts
 * Feature qui personnalise le chat Twitch (badges et effets de pseudo)
 */

import { Feature, FeatureConfig, FeatureContext } from '../core/Feature';

export interface ChatCustomizationSettings {
  enableMyBadge: boolean;
  myBadgeText: string;
  myBadgeName?: string;
  enableMyEffect: boolean;
  myEffect: string;
}

export class ChatCustomizerFeature extends Feature {
  private settings: ChatCustomizationSettings = {
    enableMyBadge: false,
    myBadgeText: '',
    myBadgeName: '',
    enableMyEffect: false,
    myEffect: 'rainbow',
  };

  private readonly colorEffects: Record<string, string> = {
    rainbow: 'background: linear-gradient(90deg, #ff0000, #ff7f00, #ffff00, #00ff00, #0000ff, #4b0082, #9400d3) !important; -webkit-background-clip: text !important; -webkit-text-fill-color: transparent !important; background-clip: text !important;',
    gradient_purple: 'background: linear-gradient(90deg, #9146FF, #c589f5) !important; -webkit-background-clip: text !important; -webkit-text-fill-color: transparent !important; background-clip: text !important;',
    gradient_ocean: 'background: linear-gradient(90deg, #00bfff, #0099ff) !important; -webkit-background-clip: text !important; -webkit-text-fill-color: transparent !important; background-clip: text !important;',
    gradient_fire: 'background: linear-gradient(90deg, #ff6b35, #ffa500) !important; -webkit-background-clip: text !important; -webkit-text-fill-color: transparent !important; background-clip: text !important;',
    gradient_sunset: 'background: linear-gradient(90deg, #ff6b6b, #ffd93d) !important; -webkit-background-clip: text !important; -webkit-text-fill-color: transparent !important; background-clip: text !important;',
    glitch: 'color: #fff !important; text-shadow: 2px 0 #ff0000, -2px 0 #00ffff, 0 0 5px rgba(255,0,255,0.5) !important;',
    neon_blue: 'color: #00ffff !important; text-shadow: 0 0 10px rgba(0,255,255,0.8) !important, 0 0 20px rgba(0,255,255,0.5) !important;',
    neon_pink: 'color: #ff006e !important; text-shadow: 0 0 10px rgba(255,0,110,0.8) !important, 0 0 20px rgba(255,0,110,0.5) !important;',
  };

  private pollingInterval: number | null = null;
  private modifiedElements = new WeakSet<Element>();
  private currentUsername: string = '';
  private styleSheet: CSSStyleSheet | null = null;
  private isProcessing = false;
  private lastUrl: string = '';

  constructor() {
    const config: FeatureConfig = {
      id: 'chat-customizer',
      name: 'Chat Customizer',
      description: 'Personnalise le chat Twitch avec badges et effets de pseudo personnalisés',
      version: '1.0.0',
      enabledByDefault: true,
      context: [FeatureContext.PAGE_SCRIPT],
      urlPatterns: [/^https?:\/\/(www\.)?twitch\.tv\//],
    };
    super(config);
  }

  protected async onInitialize(): Promise<void> {
    this.log('Initializing chat customizer');
    this.injectStyleSheet();
    this.getCurrentUsername();
    this.setupSettingsListener();
  }

  protected async onEnable(): Promise<void> {
    this.log('Enabling chat customizer');
    this.startPolling();
    this.watchUrlChanges();
  }

  protected async onDisable(): Promise<void> {
    this.log('Disabling chat customizer');
    this.stopPolling();
  }

  protected async onDestroy(): Promise<void> {
    this.stopPolling();
    this.cleanupStyles();
  }

  private injectStyleSheet(): void {
    const style = document.createElement('style');
    style.id = 'nsv-chat-customizer-styles';
    style.textContent = `
      .nsv-username-effect {
        /* Les styles spécifiques seront ajoutés dynamiquement */
      }
      
      .nsv-custom-badge {
        display: inline-flex !important;
        align-items: center !important;
        justify-content: center !important;
      }
      
      .nsv-custom-badge img[aria-label] {
        position: relative;
      }
      
      .nsv-custom-badge:hover {
        opacity: 0.8;
      }
    `;
    document.head.appendChild(style);
    this.styleSheet = style.sheet as CSSStyleSheet;
    this.log('Style sheet injected');
  }

  private cleanupStyles(): void {
    const customStyles = document.getElementById('nsv-chat-customizer-styles');
    const hideBadgeStyles = document.getElementById('nsv-hide-badges-style');
    customStyles?.remove();
    hideBadgeStyles?.remove();
  }

  private watchUrlChanges(): void {
    this.lastUrl = window.location.href;
    
    setInterval(() => {
      if (window.location.href !== this.lastUrl) {
        this.log('URL changed, reinitializing...');
        this.lastUrl = window.location.href;
        this.onPageChange();
      }
    }, 1000);
  }

  private onPageChange(): void {
    this.modifiedElements = new WeakSet<Element>();
    this.getCurrentUsername();
    
    window.dispatchEvent(new CustomEvent('NSV_RELOAD_SETTINGS'));
    
    setTimeout(() => {
      this.reprocessAllMessages();
    }, 200);
  }

  private setupSettingsListener(): void {
    window.addEventListener('NSV_SETTINGS_UPDATED', (event: any) => {
      const newSettings = event.detail;
      this.log('Settings updated via CustomEvent:', newSettings);
      this.settings = { ...this.settings, ...newSettings };
      if (this.settings.enableMyBadge && this.settings.myBadgeText) {
        this.injectHideBadgesCSS();
      }
      this.reprocessAllMessages();
    });

    window.addEventListener('message', (event: any) => {
      if (event.data && event.data.type === 'CHAT_CUSTOMIZATION_UPDATED') {
        this.log('Settings updated via message:', event.data.settings);
        this.settings = { ...this.settings, ...event.data.settings };
        if (this.settings.enableMyBadge && this.settings.myBadgeText) {
          this.injectHideBadgesCSS();
        }
        this.reprocessAllMessages();
      }
    });
    
    this.initializeSettings();
  }

  private initializeSettings(): void {
    if ((window as any).NSV_SETTINGS) {
      this.settings = { ...this.settings, ...(window as any).NSV_SETTINGS };
      this.log('Settings loaded from window.NSV_SETTINGS:', this.settings);
      if (this.settings.enableMyBadge && this.settings.myBadgeText) {
        this.injectHideBadgesCSS();
      }
      setTimeout(() => {
        this.reprocessAllMessages();
      }, 100);
    }
  }

  private injectHideBadgesCSS(): void {
    const styleId = 'nsv-hide-badges-style';
    if (document.getElementById(styleId)) return;

    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `
      [data-a-target="chat-badge"] {
        display: none !important;
      }
    `;
    document.head.appendChild(style);
    this.log('Native badges hidden CSS injected');
  }

  private getCurrentUsername(): void {
    const loginCookie = this.getCookieValue('login');
    if (loginCookie) {
      this.currentUsername = loginCookie;
      this.log('Current username detected from cookie:', this.currentUsername);
      return;
    }

    let userElement = document.querySelector('[data-a-target="user-menu-toggle"]') as HTMLElement;

    if (!userElement) {
      const firstMessage = document.querySelector('[data-a-user]');
      if (firstMessage) {
        const username = firstMessage.getAttribute('data-a-user');
        if (username) {
          this.currentUsername = username;
          this.log('Current username detected from message:', this.currentUsername);
          return;
        }
      }
    }

    if (userElement && userElement.textContent) {
      this.currentUsername = userElement.textContent.trim();
      this.log('Current username detected from DOM:', this.currentUsername);
      return;
    }

    setTimeout(() => this.getCurrentUsername(), 1000);
  }

  private getCookieValue(name: string): string {
    const nameEQ = name + '=';
    const cookies = document.cookie.split(';');
    for (let cookie of cookies) {
      cookie = cookie.trim();
      if (cookie.indexOf(nameEQ) === 0) {
        return decodeURIComponent(cookie.substring(nameEQ.length));
      }
    }
    return '';
  }

  private startPolling(): void {
    this.log('Starting chat monitoring with polling');
    
    this.pollingInterval = window.setInterval(() => {
      if (!this.isProcessing) {
        this.processExistingMessages();
      }
    }, 500);

    this.log('ChatCustomizer polling initialized');
  }

  private stopPolling(): void {
    if (this.pollingInterval !== null) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
      this.log('Polling stopped');
    }
  }

  private processExistingMessages(): void {
    this.isProcessing = true;
    try {
      const chatLines = document.querySelectorAll('[data-a-target="chat-line-message"]');
      chatLines.forEach((line) => this.processChatLine(line));
    } finally {
      this.isProcessing = false;
    }
  }

  private processChatLine(chatLine: Element): void {
    if (!chatLine || this.modifiedElements.has(chatLine)) {
      return;
    }

    const username = chatLine.getAttribute('data-a-user');
    if (!username || username !== this.currentUsername) {
      return;
    }

    this.modifiedElements.add(chatLine);

    if (this.settings.enableMyBadge && this.settings.myBadgeText) {
      this.applyCustomBadge(chatLine);
    }

    if (this.settings.enableMyEffect && this.settings.myEffect) {
      this.applyUsernameEffect(chatLine);
    }
  }

  private applyCustomBadge(chatLine: Element): void {
    if (chatLine.querySelector('.nsv-custom-badge')) return;

    const badgeContainer = chatLine.querySelector('[data-a-target="chat-badge"]');
    const insertPoint = badgeContainer?.parentElement || 
                       chatLine.querySelector('[data-a-target="chat-message-username"]')?.parentElement;

    if (!insertPoint) return;

    const badge = this.createBadgeElement();
    insertPoint.insertBefore(badge, insertPoint.firstChild);
  }

  private createBadgeElement(): HTMLDivElement {
    const badge = document.createElement('div');
    badge.className = 'nsv-custom-badge';
    badge.style.cssText = `
      display: inline-flex;
      align-items: center;
      justify-content: center;
      margin-right: 4px;
      flex-shrink: 0;
      cursor: pointer;
    `;

    if (this.settings.myBadgeName) {
      badge.setAttribute('title', this.settings.myBadgeName);
    }

    if (this.settings.myBadgeText.startsWith('data:image')) {
      badge.appendChild(this.createBadgeImage());
    } else {
      badge.appendChild(this.createBadgeText());
    }

    return badge;
  }

  private createBadgeImage(): HTMLImageElement {
    const img = document.createElement('img');
    img.src = this.settings.myBadgeText;
    img.style.cssText = 'width: 18px; height: 18px; object-fit: contain; display: block;';
    
    if (this.settings.myBadgeName) {
      img.alt = this.settings.myBadgeName;
      img.setAttribute('aria-label', `Badge ${this.settings.myBadgeName}`);
    }
    
    return img;
  }

  private createBadgeText(): HTMLSpanElement {
    const span = document.createElement('span');
    span.textContent = this.settings.myBadgeText;
    span.style.cssText = `
      display: inline-flex;
      align-items: center;
      justify-content: center;
      font-size: 12px;
      font-weight: 700;
      padding: 2px 6px;
      background-color: rgba(145, 70, 255, 0.3);
      border-radius: 3px;
      white-space: nowrap;
      line-height: 1.2;
    `;
    return span;
  }

  private applyUsernameEffect(chatLine: Element): void {
    const displayName = chatLine.querySelector('[data-a-target="chat-message-username"]') as HTMLElement;
    if (!displayName || !this.settings.enableMyEffect || !this.settings.myEffect) {
      return;
    }

    displayName.classList.remove('nsv-username-effect');
    displayName.removeAttribute('data-effect');

    const effectStyle = this.colorEffects[this.settings.myEffect];
    if (!effectStyle || !this.styleSheet) return;

    try {
      this.updateEffectStyleSheet(this.settings.myEffect, effectStyle);
      displayName.setAttribute('data-effect', this.settings.myEffect);
      displayName.classList.add('nsv-username-effect');
    } catch (e) {
      this.logError('Error applying effect:', e);
    }
  }

  private updateEffectStyleSheet(effectName: string, effectStyle: string): void {
    if (!this.styleSheet) return;

    while (this.styleSheet.cssRules.length > 0) {
      this.styleSheet.deleteRule(0);
    }

    const ruleText = `.nsv-username-effect[data-effect="${effectName}"] { ${effectStyle} }`;
    this.styleSheet.insertRule(ruleText, 0);
  }

  private reprocessAllMessages(): void {
    this.modifiedElements = new WeakSet<Element>();
    this.processExistingMessages();
  }

  public updateSettings(newSettings: Partial<ChatCustomizationSettings>): void {
    this.settings = { ...this.settings, ...newSettings };
    this.reprocessAllMessages();
  }

  public getSettings(): ChatCustomizationSettings {
    return { ...this.settings };
  }
}

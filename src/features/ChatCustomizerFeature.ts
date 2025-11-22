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
    // Gradients arc-en-ciel
    rainbow: 'background: linear-gradient(90deg, #ff0000, #ff7f00, #ffff00, #00ff00, #0000ff, #4b0082, #9400d3) !important; -webkit-background-clip: text !important; -webkit-text-fill-color: transparent !important; background-clip: text !important; animation: rainbow-shift 3s linear infinite !important;',
    rainbow_wave: 'background: linear-gradient(90deg, #ff0000, #ff7f00, #ffff00, #00ff00, #0000ff, #4b0082, #9400d3) !important; -webkit-background-clip: text !important; -webkit-text-fill-color: transparent !important; background-clip: text !important; background-size: 200% !important; animation: wave-gradient 2s ease-in-out infinite !important;',
    
    // Gradients violets
    gradient_purple: 'background: linear-gradient(90deg, #9146FF, #c589f5) !important; -webkit-background-clip: text !important; -webkit-text-fill-color: transparent !important; background-clip: text !important;',
    purple_glow: 'color: #9146FF !important; text-shadow: 0 0 10px rgba(145, 70, 255, 0.8) !important, 0 0 20px rgba(145, 70, 255, 0.5) !important, 0 0 30px rgba(145, 70, 255, 0.3) !important;',
    purple_pulse: 'color: #9146FF !important; animation: purple-pulse 2s ease-in-out infinite !important;',
    
    // Gradients bleus
    gradient_ocean: 'background: linear-gradient(90deg, #00bfff, #0099ff) !important; -webkit-background-clip: text !important; -webkit-text-fill-color: transparent !important; background-clip: text !important;',
    ocean_wave: 'background: linear-gradient(120deg, #00d4ff, #0066ff, #00d4ff) !important; -webkit-background-clip: text !important; -webkit-text-fill-color: transparent !important; background-clip: text !important; background-size: 200% !important; animation: wave-gradient 3s ease-in-out infinite !important;',
    ice_blue: 'color: #00d4ff !important; text-shadow: 0 0 5px rgba(0, 212, 255, 0.6) !important, 0 0 10px rgba(0, 212, 255, 0.4) !important;',
    
    // Gradients feu
    gradient_fire: 'background: linear-gradient(90deg, #ff6b35, #ffa500) !important; -webkit-background-clip: text !important; -webkit-text-fill-color: transparent !important; background-clip: text !important;',
    fire_flicker: 'background: linear-gradient(180deg, #ff0000, #ff6600, #ffaa00) !important; -webkit-background-clip: text !important; -webkit-text-fill-color: transparent !important; background-clip: text !important; animation: fire-flicker 1.5s ease-in-out infinite !important;',
    lava: 'background: linear-gradient(45deg, #ff0000, #ff6600, #cc0000, #ff3300) !important; -webkit-background-clip: text !important; -webkit-text-fill-color: transparent !important; background-clip: text !important; background-size: 300% !important; animation: lava-flow 4s linear infinite !important;',
    
    // Gradients sunset/gold
    gradient_sunset: 'background: linear-gradient(90deg, #ff6b6b, #ffd93d) !important; -webkit-background-clip: text !important; -webkit-text-fill-color: transparent !important; background-clip: text !important;',
    golden: 'background: linear-gradient(135deg, #ffd700, #ffed4e, #ffd700) !important; -webkit-background-clip: text !important; -webkit-text-fill-color: transparent !important; background-clip: text !important; background-size: 200% !important; animation: gold-shine 2s ease-in-out infinite !important;',
    
    // Effets néon
    neon_blue: 'color: #00ffff !important; text-shadow: 0 0 10px rgba(0,255,255,0.8) !important, 0 0 20px rgba(0,255,255,0.5) !important, 0 0 30px rgba(0,255,255,0.3) !important;',
    neon_pink: 'color: #ff006e !important; text-shadow: 0 0 10px rgba(255,0,110,0.8) !important, 0 0 20px rgba(255,0,110,0.5) !important, 0 0 30px rgba(255,0,110,0.3) !important;',
    neon_green: 'color: #39ff14 !important; text-shadow: 0 0 10px rgba(57,255,20,0.8) !important, 0 0 20px rgba(57,255,20,0.5) !important, 0 0 30px rgba(57,255,20,0.3) !important;',
    neon_pulse: 'color: #00ffff !important; animation: neon-pulse 2s ease-in-out infinite !important;',
    
    // Effets glitch
    glitch: 'color: #fff !important; text-shadow: 2px 0 #ff0000, -2px 0 #00ffff, 0 0 5px rgba(255,0,255,0.5) !important; animation: glitch-text 3s infinite !important;',
    glitch_intense: 'color: #fff !important; animation: glitch-intense 0.5s infinite !important;',
    
    // Effets spéciaux
    cyberpunk: 'background: linear-gradient(45deg, #ff00ff, #00ffff, #ff00ff) !important; -webkit-background-clip: text !important; -webkit-text-fill-color: transparent !important; background-clip: text !important; background-size: 200% !important; animation: cyberpunk-shift 3s linear infinite !important; text-shadow: 0 0 20px rgba(255,0,255,0.5) !important;',
    matrix: 'color: #00ff00 !important; text-shadow: 0 0 10px rgba(0,255,0,0.8) !important; animation: matrix-flicker 4s infinite !important;',
    hologram: 'color: #00d4ff !important; animation: hologram-glitch 5s infinite !important; text-shadow: 0 0 10px rgba(0,212,255,0.5) !important;',
    shimmer: 'background: linear-gradient(90deg, #ffffff, #dddddd, #ffffff) !important; -webkit-background-clip: text !important; -webkit-text-fill-color: transparent !important; background-clip: text !important; background-size: 200% !important; animation: shimmer-effect 2s linear infinite !important;',
    toxic: 'background: linear-gradient(90deg, #39ff14, #00ff00, #ccff00) !important; -webkit-background-clip: text !important; -webkit-text-fill-color: transparent !important; background-clip: text !important; animation: toxic-pulse 2s ease-in-out infinite !important;',
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
        display: inline-block;
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
      
      /* ===== ANIMATIONS POUR LES EFFETS DE CHAT ===== */
      
      /* Rainbow animations */
      @keyframes rainbow-shift {
        0% { filter: hue-rotate(0deg); }
        100% { filter: hue-rotate(360deg); }
      }
      
      @keyframes wave-gradient {
        0%, 100% { background-position: 0% 50%; }
        50% { background-position: 100% 50%; }
      }
      
      /* Purple animations */
      @keyframes purple-pulse {
        0%, 100% { text-shadow: 0 0 10px rgba(145, 70, 255, 0.8), 0 0 20px rgba(145, 70, 255, 0.5); }
        50% { text-shadow: 0 0 20px rgba(145, 70, 255, 1), 0 0 30px rgba(145, 70, 255, 0.8), 0 0 40px rgba(145, 70, 255, 0.5); }
      }
      
      /* Fire animations */
      @keyframes fire-flicker {
        0%, 100% { opacity: 1; filter: brightness(1); }
        25% { opacity: 0.95; filter: brightness(1.1); }
        50% { opacity: 0.9; filter: brightness(1.2); }
        75% { opacity: 0.95; filter: brightness(1.1); }
      }
      
      @keyframes lava-flow {
        0% { background-position: 0% 50%; }
        100% { background-position: 100% 50%; }
      }
      
      /* Gold animation */
      @keyframes gold-shine {
        0%, 100% { background-position: 0% 50%; filter: brightness(1); }
        50% { background-position: 100% 50%; filter: brightness(1.3); }
      }
      
      /* Neon animations */
      @keyframes neon-pulse {
        0%, 100% { 
          text-shadow: 0 0 10px rgba(0,255,255,0.8), 0 0 20px rgba(0,255,255,0.5), 0 0 30px rgba(0,255,255,0.3);
          filter: brightness(1);
        }
        50% { 
          text-shadow: 0 0 20px rgba(0,255,255,1), 0 0 30px rgba(0,255,255,0.8), 0 0 40px rgba(0,255,255,0.5);
          filter: brightness(1.2);
        }
      }
      
      /* Glitch animations */
      @keyframes glitch-text {
        0%, 90%, 100% { 
          text-shadow: 2px 0 #ff0000, -2px 0 #00ffff;
          transform: translate(0);
        }
        20% { 
          text-shadow: -2px 0 #ff0000, 2px 0 #00ffff;
          transform: translate(-2px, 1px);
        }
        40% { 
          text-shadow: 2px 0 #00ffff, -2px 0 #ff0000;
          transform: translate(2px, -1px);
        }
        60% { 
          text-shadow: -2px 0 #00ffff, 2px 0 #ff0000;
          transform: translate(-1px, 2px);
        }
      }
      
      @keyframes glitch-intense {
        0%, 100% { transform: translate(0); text-shadow: 0 0 0 transparent; }
        10% { transform: translate(-2px, 2px); text-shadow: 2px -2px #ff0000, -2px 2px #00ffff; }
        20% { transform: translate(2px, -2px); text-shadow: -2px 2px #ff0000, 2px -2px #00ffff; }
        30% { transform: translate(-2px, -2px); text-shadow: 2px 2px #ff0000, -2px -2px #00ffff; }
        40% { transform: translate(2px, 2px); text-shadow: -2px -2px #ff0000, 2px 2px #00ffff; }
        50% { transform: translate(0); text-shadow: 0 0 0 transparent; }
      }
      
      /* Special effects animations */
      @keyframes cyberpunk-shift {
        0%, 100% { background-position: 0% 50%; filter: hue-rotate(0deg); }
        50% { background-position: 100% 50%; filter: hue-rotate(20deg); }
      }
      
      @keyframes matrix-flicker {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.8; }
        75% { opacity: 1; }
        80% { opacity: 0.9; }
      }
      
      @keyframes hologram-glitch {
        0%, 90%, 100% { 
          opacity: 1; 
          transform: translate(0);
          filter: blur(0);
        }
        92% { 
          opacity: 0.7; 
          transform: translate(-1px, 1px);
          filter: blur(0.5px);
        }
        94% { 
          opacity: 0.9; 
          transform: translate(1px, -1px);
          filter: blur(0);
        }
        96% { 
          opacity: 0.8; 
          transform: translate(-1px, 0);
          filter: blur(0.3px);
        }
      }
      
      @keyframes shimmer-effect {
        0% { background-position: -200% 0; }
        100% { background-position: 200% 0; }
      }
      
      @keyframes toxic-pulse {
        0%, 100% { 
          filter: brightness(1) drop-shadow(0 0 5px rgba(57,255,20,0.5));
        }
        50% { 
          filter: brightness(1.3) drop-shadow(0 0 10px rgba(57,255,20,0.8));
        }
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
      // Force immediate reprocessing when settings change
      this.modifiedElements = new WeakSet<Element>();
      this.reprocessAllMessages();
    });

    window.addEventListener('message', (event: any) => {
      if (event.data && event.data.type === 'CHAT_CUSTOMIZATION_UPDATED') {
        this.log('Settings updated via message:', event.data.settings);
        this.settings = { ...this.settings, ...event.data.settings };
        if (this.settings.enableMyBadge && this.settings.myBadgeText) {
          this.injectHideBadgesCSS();
        }
        // Force immediate reprocessing when settings change
        this.modifiedElements = new WeakSet<Element>();
        this.reprocessAllMessages();
      }
    });
    
    // Try to load settings immediately if already available
    this.initializeSettings();
    
    // Poll for settings arrival with multiple attempts
    let attempts = 0;
    const maxAttempts = 10; // 10 attempts over 5 seconds
    const settingsPoller = setInterval(() => {
      attempts++;
      if ((window as any).NSV_SETTINGS && Object.keys((window as any).NSV_SETTINGS).length > 0) {
        this.log('Settings detected after polling');
        this.initializeSettings();
        clearInterval(settingsPoller);
      } else if (attempts >= maxAttempts) {
        this.log('Settings polling timeout - using defaults');
        clearInterval(settingsPoller);
      }
    }, 500);
  }

  private initializeSettings(): void {
    if ((window as any).NSV_SETTINGS) {
      const hasSettings = Object.keys((window as any).NSV_SETTINGS).length > 0;
      this.settings = { ...this.settings, ...(window as any).NSV_SETTINGS };
      this.log('Settings loaded from window.NSV_SETTINGS:', this.settings);
      if (this.settings.enableMyBadge && this.settings.myBadgeText) {
        this.injectHideBadgesCSS();
      }
      if (hasSettings) {
        // Clear modified elements to force reprocessing with new settings
        this.modifiedElements = new WeakSet<Element>();
        setTimeout(() => {
          this.reprocessAllMessages();
        }, 100);
      }
    } else {
      this.log('No settings found in window.NSV_SETTINGS, using defaults');
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

    // Check if badge is an image (data URL, relative path, or absolute URL)
    const badgeText = this.settings.myBadgeText;
    if (badgeText.startsWith('data:image') || 
        badgeText.endsWith('.png') || 
        badgeText.endsWith('.jpg') || 
        badgeText.endsWith('.gif') || 
        badgeText.endsWith('.svg')) {
      badge.appendChild(this.createBadgeImage());
    } else {
      badge.appendChild(this.createBadgeText());
    }

    return badge;
  }

  private createBadgeImage(): HTMLImageElement {
    const img = document.createElement('img');
    
    // L'URL est déjà convertie par le content script
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

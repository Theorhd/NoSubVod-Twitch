/**
 * ChatCustomizer - Personnalisation du chat Twitch
 * Gère les customisations du pseudo et du badge de l'utilisateur courant
 * Ce script s'exécute dans le contexte de la page (injected script)
 * Les paramètres sont reçus via le chat-customizer-bridge content script
 */

export interface ChatCustomizationSettings {
  enableMyBadge: boolean;
  myBadgeText: string;
  myBadgeName?: string;
  enableMyEffect: boolean;
  myEffect: string;
}

class ChatCustomizer {
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
    this.init();
  }

  private async init(): Promise<void> {
    this.injectStyleSheet();
    this.getCurrentUsername();
    this.setupSettingsListener();
    this.startPolling();
    this.watchUrlChanges();
    console.log('[NSV] ChatCustomizer initialized');
  }

  // Détecter les changements d'URL (changement de stream)
  private watchUrlChanges(): void {
    this.lastUrl = window.location.href;
    
    // Vérifier les changements d'URL toutes les secondes
    setInterval(() => {
      if (window.location.href !== this.lastUrl) {
        console.log('[NSV] URL changed, reinitializing...');
        this.lastUrl = window.location.href;
        this.onPageChange();
      }
    }, 1000);
  }

  private onPageChange(): void {
    // Réinitialiser l'état
    this.modifiedElements = new WeakSet<Element>();
    this.getCurrentUsername();
    
    // Demander au bridge de recharger les settings
    console.log('[NSV] Requesting settings reload from bridge');
    window.dispatchEvent(new CustomEvent('NSV_RELOAD_SETTINGS'));
    
    // Attendre un peu puis retraiter les messages
    setTimeout(() => {
      this.reprocessAllMessages();
    }, 200);
  }

  // Initialiser les paramètres depuis le storage lors du démarrage
  private initializeSettings(): void {
    // Essayer de récupérer les paramètres depuis window.NSV_SETTINGS (défini par le bridge)
    if ((window as any).NSV_SETTINGS) {
      this.settings = { ...this.settings, ...(window as any).NSV_SETTINGS };
      console.log('[NSV] Settings loaded from window.NSV_SETTINGS:', this.settings);
      if (this.settings.enableMyBadge && this.settings.myBadgeText) {
        this.injectHideBadgesCSS();
      }
      // Retraiter les messages existants avec les nouveaux paramètres
      setTimeout(() => {
        this.reprocessAllMessages();
      }, 100);
    }
  }

  // Injecter une feuille de style pour les effets
  private injectStyleSheet(): void {
    const style = document.createElement('style');
    style.id = 'nsv-chat-customizer-styles';
    style.textContent = `
      .nsv-username-effect {
        /* Les styles spécifiques seront ajoutés dynamiquement */
      }
      
      /* Styling pour le badge personnalisé pour que Twitch affiche le placeholder */
      .nsv-custom-badge {
        display: inline-flex !important;
        align-items: center !important;
        justify-content: center !important;
      }
      
      .nsv-custom-badge img[aria-label] {
        position: relative;
      }
      
      /* Créer un effect de hover comme Twitch */
      .nsv-custom-badge:hover {
        opacity: 0.8;
      }
    `;
    document.head.appendChild(style);
    this.styleSheet = style.sheet as CSSStyleSheet;
    console.log('[NSV] Style sheet injected');
  }

  // Écoute les messages du bridge pour les changements de paramètres
  private setupSettingsListener(): void {
    // Écouter le CustomEvent du bridge (envoyé au démarrage et lors des mises à jour)
    window.addEventListener('NSV_SETTINGS_UPDATED', (event: any) => {
      const newSettings = event.detail;
      console.log('[NSV] ChatCustomizer settings updated via CustomEvent:', newSettings);
      this.settings = { ...this.settings, ...newSettings };
      if (this.settings.enableMyBadge && this.settings.myBadgeText) {
        this.injectHideBadgesCSS();
      }
      // Retraiter les messages existants avec les nouveaux paramètres
      this.reprocessAllMessages();
    });

    // Écouter aussi les messages directs depuis les onglets (alternative)
    window.addEventListener('message', (event: any) => {
      if (event.data && event.data.type === 'CHAT_CUSTOMIZATION_UPDATED') {
        console.log('[NSV] ChatCustomizer settings updated via message:', event.data.settings);
        this.settings = { ...this.settings, ...event.data.settings };
        if (this.settings.enableMyBadge && this.settings.myBadgeText) {
          this.injectHideBadgesCSS();
        }
        // Retraiter les messages existants avec les nouveaux paramètres
        this.reprocessAllMessages();
      }
    });
    
    // Appeler initializeSettings après la création du listener pour charger les settings existants
    this.initializeSettings();
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
    console.log('[NSV] Native badges hidden CSS injected');
  }

  private getCurrentUsername(): void {
    // Essai 1: Récupérer depuis le cookie 'login' de Twitch
    const loginCookie = this.getCookieValue('login');
    if (loginCookie) {
      this.currentUsername = loginCookie;
      console.log('[NSV] Current username detected from cookie:', this.currentUsername);
      return;
    }

    // Essai 2: Menu utilisateur en haut à droite
    let userElement = document.querySelector('[data-a-target="user-menu-toggle"]') as HTMLElement;

    // Essai 3: Chercher n'importe quel élément avec data-a-user
    if (!userElement) {
      const firstMessage = document.querySelector('[data-a-user]');
      if (firstMessage) {
        const username = firstMessage.getAttribute('data-a-user');
        if (username) {
          this.currentUsername = username;
          console.log('[NSV] Current username detected from message:', this.currentUsername);
          return;
        }
      }
    }

    if (userElement && userElement.textContent) {
      this.currentUsername = userElement.textContent.trim();
      console.log('[NSV] Current username detected from DOM:', this.currentUsername);
      return;
    }

    // Retry if not found yet
    console.log('[NSV] Username not found yet, retrying...');
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
    console.log('[NSV] Starting chat monitoring with polling');
    
    // Vérifier les messages toutes les 500ms
    this.pollingInterval = window.setInterval(() => {
      if (!this.isProcessing) {
        this.processExistingMessages();
      }
    }, 500);

    console.log('[NSV] ChatCustomizer polling initialized');
    console.log('[NSV] Current username:', this.currentUsername || '(not yet detected)');
  }

  private stopPolling(): void {
    if (this.pollingInterval !== null) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
      console.log('[NSV] Polling stopped');
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
    // Vérifications rapides pour éviter le traitement inutile
    if (!chatLine || this.modifiedElements.has(chatLine)) {
      return;
    }

    const username = chatLine.getAttribute('data-a-user');
    if (!username || username !== this.currentUsername) {
      return;
    }

    // Marquer comme traité
    this.modifiedElements.add(chatLine);

    // Appliquer les customisations
    if (this.settings.enableMyBadge && this.settings.myBadgeText) {
      this.applyCustomBadge(chatLine);
    }

    if (this.settings.enableMyEffect && this.settings.myEffect) {
      this.applyUsernameEffect(chatLine);
    }
  }

  private applyCustomBadge(chatLine: Element): void {
    // Vérifier s'il y a déjà un badge NSV
    if (chatLine.querySelector('.nsv-custom-badge')) return;

    // Trouver le point d'insertion
    const badgeContainer = chatLine.querySelector('[data-a-target="chat-badge"]');
    const insertPoint = badgeContainer?.parentElement || 
                       chatLine.querySelector('[data-a-target="chat-message-username"]')?.parentElement;

    if (!insertPoint) return;

    // Créer le badge
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

    // Ajouter le contenu (image ou texte)
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

    // Réinitialiser et appliquer l'effet
    displayName.classList.remove('nsv-username-effect');
    displayName.removeAttribute('data-effect');

    const effectStyle = this.colorEffects[this.settings.myEffect];
    if (!effectStyle || !this.styleSheet) return;

    try {
      // Nettoyer et injecter la nouvelle règle CSS
      this.updateEffectStyleSheet(this.settings.myEffect, effectStyle);
      
      // Appliquer la classe et l'attribut
      displayName.setAttribute('data-effect', this.settings.myEffect);
      displayName.classList.add('nsv-username-effect');
    } catch (e) {
      console.error('[NSV] Error applying effect:', e);
    }
  }

  private updateEffectStyleSheet(effectName: string, effectStyle: string): void {
    if (!this.styleSheet) return;

    // Nettoyer les anciennes règles
    while (this.styleSheet.cssRules.length > 0) {
      this.styleSheet.deleteRule(0);
    }

    // Ajouter la nouvelle règle
    const ruleText = `.nsv-username-effect[data-effect="${effectName}"] { ${effectStyle} }`;
    this.styleSheet.insertRule(ruleText, 0);
  }

  // API publique simplifiée
  public updateSettings(newSettings: Partial<ChatCustomizationSettings>): void {
    this.settings = { ...this.settings, ...newSettings };
    this.reprocessAllMessages();
  }

  public getSettings(): ChatCustomizationSettings {
    return { ...this.settings };
  }

  private reprocessAllMessages(): void {
    // Réinitialiser et retraiter tous les messages
    this.modifiedElements = new WeakSet<Element>();
    this.processExistingMessages();
  }

  public destroy(): void {
    this.stopPolling();
    
    // Nettoyer les styles injectés
    const customStyles = document.getElementById('nsv-chat-customizer-styles');
    const hideBadgeStyles = document.getElementById('nsv-hide-badges-style');
    
    customStyles?.remove();
    hideBadgeStyles?.remove();
    
    console.log('[NSV] ChatCustomizer destroyed');
  }
}

// Initialisation automatique
const customizer = new ChatCustomizer();
(window as any).chatCustomizer = customizer;

export default ChatCustomizer;

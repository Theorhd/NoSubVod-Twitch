/**
 * InterfaceChangerFeature.ts
 * Feature qui modifie l'interface Twitch pour simuler un statut d'abonné
 */

import { Feature, FeatureConfig, FeatureContext } from '../core/Feature';

export class InterfaceChangerFeature extends Feature {
  private observer: MutationObserver | null = null;
  private modifiedButtons = new WeakSet<HTMLElement>();

  constructor() {
    const config: FeatureConfig = {
      id: 'interface-changer',
      name: 'Interface Changer',
      description: 'Modifie les boutons d\'abonnement pour simuler un statut d\'abonné',
      version: '1.0.0',
      enabledByDefault: true,
      context: [FeatureContext.PAGE_SCRIPT, FeatureContext.CONTENT_SCRIPT],
      urlPatterns: [/^https?:\/\/(www\.)?twitch\.tv\//],
    };
    super(config);
  }

  protected async onInitialize(): Promise<void> {
    this.log('Initializing interface changer');
  }

  protected async onEnable(): Promise<void> {
    this.log('Enabling interface changer');
    this.modifyExistingElements();
    this.startObserver();
  }

  protected async onDisable(): Promise<void> {
    this.log('Disabling interface changer');
    this.stopObserver();
    // Note: On ne restaure pas les boutons modifiés pour éviter des problèmes
  }

  protected async onDestroy(): Promise<void> {
    this.stopObserver();
  }

  private modifyExistingElements(): void {
    this.findAndModifySubscribeButtons();
    this.removeVideoRestrictions();
  }

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
    if (this.isSubscribeButton(node)) {
      this.modifySubscribeButton(node as HTMLElement);
      return;
    }

    node.querySelectorAll('button').forEach((btn) => {
      if (this.isSubscribeButton(btn)) {
        this.modifySubscribeButton(btn);
      }
    });
  }

  private findAndModifySubscribeButtons(): void {
    const buttons = document.querySelectorAll('button');
    buttons.forEach((btn) => {
      if (this.isSubscribeButton(btn) && !this.modifiedButtons.has(btn)) {
        this.modifySubscribeButton(btn);
      }
    });
  }

  private isSubscribeButton(element: Element): boolean {
    if (element.tagName !== 'BUTTON') {
      return false;
    }

    const button = element as HTMLElement;
    const dataTarget = button.getAttribute('data-a-target')?.toLowerCase() || '';
    if (dataTarget.includes('subscribe')) {
      return true;
    }

    const text = button.textContent?.toLowerCase() || '';
    const ariaLabel = button.getAttribute('aria-label')?.toLowerCase() || '';

    const subscribePatterns = [
      'subscribe',
      's\'abonner',
      'resubscribe',
      're-subscribe',
      'se réabonner',
      'channel subscriptions',
      'subscribe now',
      'channel subscription',
    ];

    return subscribePatterns.some(
      (pattern) => text.includes(pattern) || ariaLabel.includes(pattern),
    );
  }

  private modifySubscribeButton(button: HTMLElement): void {
    if (this.modifiedButtons.has(button)) {
      return;
    }
    this.modifiedButtons.add(button);

    button.setAttribute('data-nsv-original-aria-label', button.getAttribute('aria-label') || '');
    button.setAttribute('data-nsv-modified', 'true');

    (button as HTMLButtonElement).disabled = true;

    this.updateButtonStyles(button);
    this.updateButtonText(button);

    button.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
    }, true);
  }

  private updateButtonStyles(button: HTMLElement): void {
    button.style.opacity = '0.7';
    button.style.cursor = 'default';
    button.style.pointerEvents = 'none';

    const labelElement = button.querySelector('[data-a-target="tw-core-button-label-text"]') as HTMLElement;
    if (labelElement) {
      labelElement.style.opacity = '0.8';
    }
  }

  private updateButtonText(button: HTMLElement): void {
    const ariaLabel = button.getAttribute('aria-label')?.toLowerCase() || '';
    const text = button.textContent?.toLowerCase() || '';

    let newLabel = 'Subscribed';
    let newText = 'Subscribed';

    if (ariaLabel.includes('s\'abonner') || text.includes('s\'abonner')) {
      newLabel = 'Abonné';
      newText = 'Abonné';
    } else if (ariaLabel.includes('se réabonner') || text.includes('se réabonner')) {
      newLabel = 'Abonné';
      newText = 'Abonné';
    }

    button.setAttribute('aria-label', newLabel);

    const labelElement = button.querySelector('[data-a-target="tw-core-button-label-text"]') as HTMLElement;
    if (labelElement) {
      labelElement.textContent = newText;
    } else {
      button.textContent = newText;
    }
  }

  private removeVideoRestrictions(): void {
    const restrictionSelectors = [
      '.video-preview-card-restriction',
      '[data-a-target*="restriction"]',
    ];

    restrictionSelectors.forEach(selector => {
      try {
        document.querySelectorAll(selector).forEach(el => {
          const text = (el.textContent || '').toLowerCase();
          const ariaLabel = (el.getAttribute('aria-label') || '').toLowerCase();

          if (
            text.includes('réservé') ||
            text.includes('reserved') ||
            text.includes('abonné') ||
            text.includes('subscriber') ||
            ariaLabel.includes('réservé') ||
            ariaLabel.includes('reserved')
          ) {
            el.remove();
          }
        });
      } catch (e) {
        // Invalid selector, skip
      }
    });
  }
}

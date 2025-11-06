/**
 * RestrictionRemoverFeature.ts
 * Feature qui supprime les overlays/badges de restriction sur les vidéos
 */

import { Feature, FeatureConfig, FeatureContext } from '../core/Feature';

export class RestrictionRemoverFeature extends Feature {
  private observer: MutationObserver | null = null;
  private readonly restrictionSelectors = [
    '.video-preview-card-restriction',
    '[data-a-target*="restriction"]',
    '[aria-label*="réservé"]',
    '[aria-label*="reserved"]',
    '[aria-label*="abonné"]',
    '[aria-label*="subscriber"]',
  ];

  constructor() {
    const config: FeatureConfig = {
      id: 'restriction-remover',
      name: 'Restriction Remover',
      description: 'Supprime les overlays et badges de restriction sur les vidéos',
      version: '1.0.0',
      enabledByDefault: true,
      context: [FeatureContext.CONTENT_SCRIPT],
      urlPatterns: [/^https?:\/\/(www\.)?twitch\.tv\//],
    };
    super(config);
  }

  protected async onInitialize(): Promise<void> {
    this.log('Initializing restriction remover');
  }

  protected async onEnable(): Promise<void> {
    this.log('Enabling restriction remover');
    this.removeExistingRestrictions();
    this.startObserver();
    this.setupSPANavigation();
  }

  protected async onDisable(): Promise<void> {
    this.log('Disabling restriction remover');
    this.stopObserver();
  }

  protected async onDestroy(): Promise<void> {
    this.stopObserver();
  }

  private setupSPANavigation(): void {
    window.addEventListener('locationchange', () => {
      this.log('SPA navigation detected, removing restrictions');
      this.removeExistingRestrictions();
    });
  }

  private removeExistingRestrictions(): void {
    this.restrictionSelectors.forEach(selector => {
      try {
        document.querySelectorAll(selector).forEach(el => {
          if (this.isRestrictionElement(el)) {
            el.remove();
          }
        });
      } catch (e) {
        // Invalid selector, skip
      }
    });
  }

  private isRestrictionElement(element: Element): boolean {
    const text = (element.textContent || '').toLowerCase();
    const ariaLabel = (element.getAttribute('aria-label') || '').toLowerCase();
    const classString = typeof element.className === 'string' ? element.className : '';

    const restrictionKeywords = [
      'réservé',
      'reserved',
      'abonné',
      'subscriber',
      'restriction',
      'sub only',
      'subbed only',
      'followers only',
      'abonnés uniquement',
    ];

    return (
      restrictionKeywords.some(
        keyword => text.includes(keyword) || ariaLabel.includes(keyword),
      ) || classString.includes('restriction')
    );
  }

  private startObserver(): void {
    if (!document.body) {
      setTimeout(() => this.startObserver(), 100);
      return;
    }

    this.observer = new MutationObserver(mutations => {
      mutations.forEach(mutation => {
        mutation.addedNodes.forEach(node => {
          if (node.nodeType === Node.ELEMENT_NODE) {
            this.processNode(node as Element);
          }
        });
      });
    });

    this.observer.observe(document.body, {
      childList: true,
      subtree: true
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
    if (this.isRestrictionElement(node)) {
      node.remove();
      return;
    }

    this.restrictionSelectors.forEach(selector => {
      try {
        node.querySelectorAll(selector).forEach(el => {
          if (this.isRestrictionElement(el)) {
            el.remove();
          }
        });
      } catch (e) {
        // Invalid selector, skip
      }
    });
  }
}

// Detect SPA navigation events and dispatch custom event
(function() {
  const _push = history.pushState;
  history.pushState = function(...args) {
    const res = _push.apply(this, args as any);
    window.dispatchEvent(new Event('locationchange'));
    return res;
  };
  const _replace = history.replaceState;
  history.replaceState = function(...args) {
    const res = _replace.apply(this, args as any);
    window.dispatchEvent(new Event('locationchange'));
    return res;
  };
  window.addEventListener('popstate', () => window.dispatchEvent(new Event('locationchange')));
})();
class RestrictionRemover {
  private observer!: MutationObserver;
  private restrictionSelectors = [
    '.video-preview-card-restriction',
    '[data-a-target*="restriction"]',
    '[aria-label*="réservé"]',
    '[aria-label*="reserved"]',
    '[aria-label*="abonné"]',
    '[aria-label*="subscriber"]',
  ];

  constructor() {
    this.removeExistingRestrictions();
    this.createObserver();
  }

  public removeExistingRestrictions(): void {
    this.restrictionSelectors.forEach(selector => {
      try {
        document.querySelectorAll(selector).forEach(el => {
          // Only remove if it's a restriction overlay/badge
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

    // Check for common restriction indicators
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

  private createObserver(): void {
    // Ensure DOM is ready
    if (!document.body) {
      setTimeout(() => this.createObserver(), 100);
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
  }

  private processNode(node: Element): void {
    // Check if this node is a restriction element
    if (this.isRestrictionElement(node)) {
      node.remove();
      return;
    }

    // Check all children for restriction elements
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

// Initialize restriction remover immediately for SPA and initial page load
function initRestrictionRemover() {
  if (!document.body) {
    document.addEventListener('DOMContentLoaded', initRestrictionRemover);
    return;
  }
  const remover = new RestrictionRemover();
  // Remove restrictions on each SPA navigation
  window.addEventListener('locationchange', () => remover.removeExistingRestrictions());
}

initRestrictionRemover();

export {};

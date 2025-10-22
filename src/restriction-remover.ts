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

  constructor() {
    this.removeExistingRestrictions();
    this.createObserver();
  }

  public removeExistingRestrictions(): void {
    document.querySelectorAll('.video-preview-card-restriction').forEach(el => el.remove());
  }

  private createObserver(): void {
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
    if (node.classList.contains('video-preview-card-restriction')) {
      node.remove();
      return;
    }
    node.querySelectorAll('.video-preview-card-restriction').forEach(el => el.remove());
  }
}

// Initialize restriction remover immediately for SPA and initial page load
const remover = new RestrictionRemover();
// Remove restrictions on each SPA navigation
window.addEventListener('locationchange', () => remover.removeExistingRestrictions());

export {};

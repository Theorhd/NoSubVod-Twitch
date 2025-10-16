class RestrictionRemover {
  private observer!: MutationObserver;

  constructor() {
    this.removeExistingRestrictions();
    this.createObserver();
  }

  private removeExistingRestrictions(): void {
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

document.addEventListener('DOMContentLoaded', () => {
  new RestrictionRemover();
});

export {};

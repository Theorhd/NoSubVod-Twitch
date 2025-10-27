/**
 * InterfaceChange.ts
 * Modifies Twitch interface elements to simulate subscriber status
 * Replaces the subscribe button with a "subscribed" state button
 */

class InterfaceChange {
  private observer!: MutationObserver;
  private modifiedButtons = new WeakSet<HTMLElement>();

  constructor() {
    this.modifyExistingElements();
    this.createObserver();
  }

  /**
   * Process and modify existing subscribe buttons on the page
   */
  private modifyExistingElements(): void {
    // Find all subscribe buttons on the page
    this.findAndModifySubscribeButtons();
    
    // Remove video restriction overlays
    this.removeVideoRestrictions();
  }

  private createObserver(): void {
    // Ensure DOM is ready
    if (!document.body) {
      setTimeout(() => this.createObserver(), 100);
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
  }

  /**
   * Process a node to find and modify subscribe buttons
   */
  private processNode(node: Element): void {
    // Check if this node is a subscribe button
    if (this.isSubscribeButton(node)) {
      this.modifySubscribeButton(node as HTMLElement);
      return;
    }

    // Check children for subscribe buttons
    node.querySelectorAll('button').forEach((btn) => {
      if (this.isSubscribeButton(btn)) {
        this.modifySubscribeButton(btn);
      }
    });
  }

  /**
   * Find all subscribe buttons on the current page
   */
  private findAndModifySubscribeButtons(): void {
    const buttons = document.querySelectorAll('button');
    buttons.forEach((btn) => {
      if (this.isSubscribeButton(btn) && !this.modifiedButtons.has(btn)) {
        this.modifySubscribeButton(btn);
      }
    });
  }

  /**
   * Determine if a button is a subscribe/re-subscribe button
   */
  private isSubscribeButton(element: Element): boolean {
    if (element.tagName !== 'BUTTON') {
      return false;
    }

    const button = element as HTMLElement;
    
    // Check data-a-target attribute (Twitch specific)
    const dataTarget = button.getAttribute('data-a-target')?.toLowerCase() || '';
    if (dataTarget.includes('subscribe')) {
      return true;
    }

    const text = button.textContent?.toLowerCase() || '';
    const ariaLabel = button.getAttribute('aria-label')?.toLowerCase() || '';

    // Check for common subscribe/resubscribe button text patterns
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

  /**
   * Modify a subscribe button to appear as if we are already subscribed
   */
  private modifySubscribeButton(button: HTMLElement): void {
    // Prevent double modification
    if (this.modifiedButtons.has(button)) {
      return;
    }
    this.modifiedButtons.add(button);

    // Store original state
    button.setAttribute('data-nsv-original-aria-label', button.getAttribute('aria-label') || '');
    button.setAttribute('data-nsv-modified', 'true');

    // Disable button interactions
    (button as HTMLButtonElement).disabled = true;

    // Update visual styling to indicate subscribed state
    this.updateButtonStyles(button);

    // Update button text and aria-label
    this.updateButtonText(button);

    // Prevent click events
    button.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
    }, true);
  }

  /**
   * Update the CSS classes and styles for subscribed appearance
   */
  private updateButtonStyles(button: HTMLElement): void {
    // Apply styling to indicate disabled/subscribed state
    button.style.opacity = '0.7';
    button.style.cursor = 'default';
    button.style.pointerEvents = 'none';

    // Change button appearance to look like a subscribed/inactive button
    // Find the label text element within the button
    const labelElement = button.querySelector('[data-a-target="tw-core-button-label-text"]') as HTMLElement;
    if (labelElement) {
      labelElement.style.opacity = '0.8';
    }
  }

  /**
   * Update the button text to indicate subscription
   */
  private updateButtonText(button: HTMLElement): void {
    const ariaLabel = button.getAttribute('aria-label')?.toLowerCase() || '';
    const text = button.textContent?.toLowerCase() || '';

    let newLabel = 'Subscribed';
    let newText = 'Subscribed';

    // Localize based on current language
    if (ariaLabel.includes('s\'abonner') || text.includes('s\'abonner')) {
      newLabel = 'Abonné';
      newText = 'Abonné';
    } else if (ariaLabel.includes('se réabonner') || text.includes('se réabonner')) {
      newLabel = 'Abonné';
      newText = 'Abonné';
    }

    // Update aria-label
    button.setAttribute('aria-label', newLabel);

    // Update button text content
    const labelElement = button.querySelector('[data-a-target="tw-core-button-label-text"]') as HTMLElement;
    if (labelElement) {
      labelElement.textContent = newText;
    } else {
      button.textContent = newText;
    }
  }

  /**
   * Stop observing the document
   */
  public disconnect(): void {
    this.observer.disconnect();
  }

  /**
   * Remove video restriction overlays/badges from video cards
   */
  private removeVideoRestrictions(): void {
    // Find and remove restriction badges on video cards
    const restrictionSelectors = [
      '.video-preview-card-restriction',
      '[data-a-target*="restriction"]',
    ];

    restrictionSelectors.forEach(selector => {
      try {
        document.querySelectorAll(selector).forEach(el => {
          const text = (el.textContent || '').toLowerCase();
          const ariaLabel = (el.getAttribute('aria-label') || '').toLowerCase();

          // Check if it's a subscription restriction
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

// Initialize on page load
function initInterfaceChange() {
  if (!document.body) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', initInterfaceChange);
    } else {
      setTimeout(initInterfaceChange, 100);
    }
    return;
  }
  new InterfaceChange();
  console.log('[NSV] InterfaceChange initialized');
}

// Start initialization
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initInterfaceChange);
} else {
  initInterfaceChange();
}

export { InterfaceChange };


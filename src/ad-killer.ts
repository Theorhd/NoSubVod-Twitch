// Ad Killer for Twitch - Bypass pre-roll and mid-roll ads
import { logger, getResponseHeaders, getRequestHeaders } from './logger';

(function() {
  console.log('[NoSubVod] Ad Killer initialized');

  // Store original fetch and XMLHttpRequest for later use
  const originalFetch = window.fetch;
  const originalXHROpen = XMLHttpRequest.prototype.open;
  const originalXHRSend = XMLHttpRequest.prototype.send;

  // List of ad-related endpoints and patterns to block
  const adBlockPatterns = [
    /^https?:\/\/.*ads\.twitch\.tv/,
    /^https?:\/\/.*ad\.doubleclick\.net/,
    /^https?:\/\/.*googleadservices\.com/,
    /^https?:\/\/.*amazon-adsystem\.com/,
    /^https?:\/\/.*pubads\.g\.doubleclick\.net/,
    /^https?:\/\/.*pagead2\.googlesyndication\.com/,
    /^https?:\/\/.*analytics\.tiktok\.com/,
    /video-ad-stats\.twitch\.tv/,
    /\/api\/channel\/commercial/,
  ];

  // Patterns for GQL requests that contain ad information
  const gqlAdPatterns = [
    'VideoAdvertisement',
    'StreamScheduledAds',
    'AdBreaks',
    'DisplayAds',
    'CommercialBreak',
  ];

  /**
   * Check if URL matches any ad pattern
   */
  function isAdRequest(url: string): boolean {
    return adBlockPatterns.some(pattern => pattern.test(url));
  }

  /**
   * Check if GQL request body contains ad-related queries
   */
  function isAdGQLRequest(body: any): boolean {
    if (typeof body === 'string') {
      return gqlAdPatterns.some(pattern => body.includes(pattern));
    }
    return false;
  }

  /**
   * Clean ad data from GQL response
   */
  function cleanAdDataFromResponse(data: any): any {
    if (!data) return data;

    // Clone the data to avoid mutating the original
    const cleaned = JSON.parse(JSON.stringify(data));

    // Remove ad-related fields from the response
    if (cleaned.data) {
      if (cleaned.data.videoAdvertisement) {
        cleaned.data.videoAdvertisement = null;
      }
      if (cleaned.data.streamScheduledAds) {
        cleaned.data.streamScheduledAds = [];
      }
      if (cleaned.data.channel?.commercialBreaks) {
        cleaned.data.channel.commercialBreaks = [];
      }
    }

    return cleaned;
  }

  /**
   * Override fetch to intercept ad requests
   */
  window.fetch = async function(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    const url = input instanceof Request ? input.url : input.toString();
    const method = init?.method || (input instanceof Request ? input.method : 'GET');

    // Log all fetch requests in developer mode
    logger.log({
      type: 'fetch',
      url,
      method,
      message: `Fetch request: ${method} ${url}`,
      details: {
        requestHeaders: getRequestHeaders(input instanceof Request ? input : (init || {}))
      }
    });

    // Block ad requests only
    if (isAdRequest(url)) {
      console.log('[NoSubVod] Blocked ad request:', url);
      
      logger.log({
        type: 'ad-block',
        url,
        method,
        message: 'BLOCKED ad request',
        details: { reason: 'Matched ad pattern' }
      });
      
      return new Response('{}', { 
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Intercept GQL requests to remove ad data (but don't block the request)
    if (url.includes('gql.twitch.tv') && init?.body) {
      const isAdQuery = isAdGQLRequest(init.body);
      
      if (isAdQuery) {
        console.log('[NoSubVod] Intercepting ad-related GQL query');
        
        logger.log({
          type: 'ad-block',
          url,
          message: 'Intercepting GQL ad query',
          details: { body: init.body }
        });
        
        try {
          // Call the original fetch
          const response = await originalFetch(input, init);
          
          logger.log({
            type: 'fetch',
            url,
            status: response.status,
            message: 'GQL response received',
            details: {
              responseHeaders: getResponseHeaders(response)
            }
          });
          
          // Only process if response is OK
          if (!response.ok) {
            return response;
          }
          
          // Clone the response to read it
          const clonedResponse = response.clone();
          const data = await clonedResponse.json();
          const cleanedData = cleanAdDataFromResponse(data);
          
          logger.log({
            type: 'ad-block',
            url,
            message: 'Cleaned ad data from GQL response',
            details: { 
              originalKeys: Object.keys(data.data || {}),
              cleanedKeys: Object.keys(cleanedData.data || {})
            }
          });
          
          // Return a new response with cleaned data
          return new Response(JSON.stringify(cleanedData), {
            status: response.status,
            statusText: response.statusText,
            headers: response.headers,
          });
        } catch (e) {
          // If anything fails, call original fetch
          console.warn('[NoSubVod] Failed to process GQL response, using original:', e);
          
          logger.log({
            type: 'error',
            url,
            message: 'Failed to process GQL response',
            details: { error: String(e) }
          });
          
          return originalFetch(input, init);
        }
      }
    }

    // Call original fetch for all other requests
    const response = await originalFetch(input, init);
    
    logger.log({
      type: 'fetch',
      url,
      status: response.status,
      message: `Fetch response: ${response.status} ${url}`,
      details: {
        responseHeaders: getResponseHeaders(response)
      }
    });
    
    return response;
  };

  /**
   * Override XMLHttpRequest to intercept ad requests
   */
  XMLHttpRequest.prototype.open = function(method: string, url: string | URL) {
    const urlString = url.toString();
    
    // Store the URL for later use in send()
    (this as any)._url = urlString;
    (this as any)._method = method;
    (this as any)._isAdRequest = isAdRequest(urlString);
    
    logger.log({
      type: 'xhr',
      url: urlString,
      method,
      message: `XHR open: ${method} ${urlString}`
    });
    
    if ((this as any)._isAdRequest) {
      console.log('[NoSubVod] Blocking ad XHR request:', urlString);
      
      logger.log({
        type: 'ad-block',
        url: urlString,
        method,
        message: 'BLOCKED ad XHR request',
        details: { reason: 'Matched ad pattern' }
      });
    }
    
    // @ts-ignore - Call with original arguments
    return originalXHROpen.apply(this, arguments);
  };

  XMLHttpRequest.prototype.send = function(body?: Document | XMLHttpRequestBodyInit | null) {
    const isAd = (this as any)._isAdRequest;
    const url = (this as any)._url;
    const method = (this as any)._method;
    
    // Block ad requests by simulating an empty successful response
    if (isAd) {
      // Simulate successful empty response
      setTimeout(() => {
        Object.defineProperty(this, 'readyState', { value: 4, configurable: true });
        Object.defineProperty(this, 'status', { value: 200, configurable: true });
        Object.defineProperty(this, 'responseText', { value: '{}', configurable: true });
        Object.defineProperty(this, 'response', { value: '{}', configurable: true });
        
        const event = new Event('readystatechange');
        this.dispatchEvent(event);
        
        if (this.onreadystatechange) {
          this.onreadystatechange(event as any);
        }
        if (this.onload) {
          this.onload(new ProgressEvent('load') as any);
        }
        
        logger.log({
          type: 'ad-block',
          url,
          method,
          status: 200,
          message: 'Simulated empty response for blocked ad XHR'
        });
      }, 0);
      
      return;
    }
    
    // Add listener to log response
    const originalOnReadyStateChange = this.onreadystatechange;
    this.onreadystatechange = function(ev) {
      if (this.readyState === 4) {
        logger.log({
          type: 'xhr',
          url,
          method,
          status: this.status,
          message: `XHR response: ${this.status} ${url}`
        });
      }
      if (originalOnReadyStateChange) {
        originalOnReadyStateChange.call(this, ev);
      }
    };
    
    // Call original send for non-ad requests
    return originalXHRSend.call(this, body);
  };

  /**
   * Inject CSS to hide ad-related UI elements
   */
  function injectAdBlockingCSS() {
    const style = document.createElement('style');
    style.textContent = `
      /* Hide ad overlays and banners */
      [data-a-target="video-ad-label"],
      [data-a-target="video-ad-countdown"],
      [data-test-selector="video-ad-label"],
      .video-ad,
      .video-ad__overlay,
      .video-ad-container,
      .ad-banner,
      .tw-ad-banner,
      .commercial-break-indicator {
        display: none !important;
        opacity: 0 !important;
        visibility: hidden !important;
        height: 0 !important;
        width: 0 !important;
      }
    `;
    (document.head || document.documentElement).appendChild(style);
    console.log('[NoSubVod] Injected ad-blocking CSS');
  }

  /**
   * Monitor and remove ad UI elements from DOM
   */
  function setupDOMObserver() {
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === Node.ELEMENT_NODE) {
            const element = node as Element;
            
            // Remove only specific ad UI elements (not player overlays)
            const adSelectors = [
              '[data-a-target="video-ad-label"]',
              '[data-a-target="video-ad-countdown"]',
              '[data-test-selector="video-ad-label"]',
              '.commercial-break-indicator',
            ];
            
            adSelectors.forEach(selector => {
              try {
                if (element.matches && element.matches(selector)) {
                  element.remove();
                  console.log('[NoSubVod] Removed ad element:', selector);
                }
                
                element.querySelectorAll(selector).forEach(el => {
                  el.remove();
                  console.log('[NoSubVod] Removed ad element:', selector);
                });
              } catch (e) {
                // Selector error, ignore
              }
            });
          }
        });
      });
    });

    if (document.body) {
      observer.observe(document.body, {
        childList: true,
        subtree: true,
      });
      console.log('[NoSubVod] DOM observer started');
    } else {
      // Wait for body to be available
      setTimeout(setupDOMObserver, 100);
    }
  }

  /**
   * Override video player ad methods (disabled for now to avoid conflicts)
   */
  function patchVideoPlayer() {
    // Temporarily disabled - uncomment if needed
    /*
    const checkInterval = setInterval(() => {
      const player = (window as any).Twitch?.Player;
      
      if (player) {
        clearInterval(checkInterval);
        
        const originalSetup = player.prototype.setCommercialBreak;
        if (originalSetup) {
          player.prototype.setCommercialBreak = function() {
            console.log('[NoSubVod] Blocked commercial break call');
            return;
          };
        }
        
        console.log('[NoSubVod] Patched video player');
      }
    }, 1000);
    
    setTimeout(() => clearInterval(checkInterval), 30000);
    */
  }

  /**
   * Initialize ad killer when DOM is ready
   */
  function init() {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => {
        injectAdBlockingCSS();
        setupDOMObserver();
        patchVideoPlayer();
      });
    } else {
      injectAdBlockingCSS();
      setupDOMObserver();
      patchVideoPlayer();
    }
  }

  init();

  // Re-initialize on navigation (for SPA)
  window.addEventListener('locationchange', () => {
    console.log('[NoSubVod] Page navigation detected, re-initializing ad killer');
    injectAdBlockingCSS();
  });

  // Expose logger globally for debugging
  (window as any).NoSubVodLogger = {
    getLogs: () => logger.getLogs(),
    exportLogs: () => logger.exportLogs(),
    downloadLogs: () => logger.downloadLogs(),
    clearLogs: () => logger.clearLogs(),
    isDeveloperMode: () => logger.isDeveloperModeEnabled()
  };

  console.log('[NoSubVod] Ad Killer ready');
  console.log('[NoSubVod] Type "NoSubVodLogger.downloadLogs()" in console to export logs');
})();

export {};

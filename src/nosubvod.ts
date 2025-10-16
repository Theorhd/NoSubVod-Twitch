declare const chrome: any;

// Inject page script for patching Worker on VOD pages
if (window.location.pathname.includes('/videos/')) {
  const patchUrl = chrome.runtime.getURL('dist/patch_amazonworker.js');
  const appUrl = chrome.runtime.getURL('dist/app.js');
  const initUrl = chrome.runtime.getURL('dist/page_init.js');
  
  // Inject page initializer with patch URL in data attribute
  const initScript = document.createElement('script');
  initScript.src = initUrl;
  initScript.dataset.patchUrl = patchUrl;
  initScript.onload = () => initScript.remove();
  (document.head || document.documentElement)!.appendChild(initScript);
  
  // Inject Worker override script
  const overrideScript = document.createElement('script');
  overrideScript.src = appUrl;
  overrideScript.onload = () => overrideScript.remove();
  (document.head || document.documentElement)!.appendChild(overrideScript);
}

export {};

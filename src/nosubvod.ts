declare const chrome: any;

console.log('[NSV] NoSubVod content script starting...');

// Inject Ad Killer script on all Twitch pages (runs first for maximum effectiveness)
const adKillerUrl = chrome.runtime.getURL('dist/ad-killer.js');
const adKillerScript = document.createElement('script');
adKillerScript.src = adKillerUrl;
adKillerScript.onload = () => {
  console.log('[NSV] Ad Killer script injected and loaded');
  adKillerScript.remove();
};
adKillerScript.onerror = () => console.error('[NSV] Failed to load Ad Killer script');
(document.head || document.documentElement)!.appendChild(adKillerScript);

// Inject InterfaceChange script on all Twitch pages (not just VOD)
const interfaceChangeUrl = chrome.runtime.getURL('dist/InterfaceChange.js');
const interfaceScript = document.createElement('script');
interfaceScript.src = interfaceChangeUrl;
interfaceScript.onload = () => {
  console.log('[NSV] InterfaceChange script injected and loaded');
  interfaceScript.remove();
};
interfaceScript.onerror = () => console.error('[NSV] Failed to load InterfaceChange script');
(document.head || document.documentElement)!.appendChild(interfaceScript);

// Inject ChatCustomizer script for chat customization
const chatCustomizerUrl = chrome.runtime.getURL('dist/ChatCustomizer.js');
const chatCustomizerScript = document.createElement('script');
chatCustomizerScript.src = chatCustomizerUrl;
chatCustomizerScript.onload = () => {
  console.log('[NSV] ChatCustomizer script injected and loaded');
  chatCustomizerScript.remove();
};
chatCustomizerScript.onerror = () => console.error('[NSV] Failed to load ChatCustomizer script');
(document.head || document.documentElement)!.appendChild(chatCustomizerScript);

// Inject Worker patch and scripts on VOD and channel pages
const patchUrl = chrome.runtime.getURL('dist/patch_amazonworker.js');
const appUrl = chrome.runtime.getURL('dist/app.js');
const initUrl = chrome.runtime.getURL('dist/page_init.js');

console.log('[NSV] Patch URL:', patchUrl);
console.log('[NSV] App URL:', appUrl);

// Inject page initializer with patch URL
const initScript = document.createElement('script');
initScript.src = initUrl;
initScript.dataset.patchUrl = patchUrl;
initScript.onload = () => {
  console.log('[NSV] Page init script injected and loaded');
  initScript.remove();
};
initScript.onerror = () => console.error('[NSV] Failed to load page init script');
(document.head || document.documentElement)!.appendChild(initScript);

// Inject Worker override script (for all pages, not just VOD)
const overrideScript = document.createElement('script');
overrideScript.src = appUrl;
overrideScript.onload = () => {
  console.log('[NSV] Worker override script injected and loaded');
  overrideScript.remove();
};
overrideScript.onerror = () => console.error('[NSV] Failed to load worker override script');
(document.head || document.documentElement)!.appendChild(overrideScript);

console.log('[NSV] All scripts injection initiated');

export {};

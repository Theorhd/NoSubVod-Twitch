declare const chrome: any;

// Inject InterfaceChange script on all Twitch pages (not just VOD)
const interfaceChangeUrl = chrome.runtime.getURL('dist/InterfaceChange.js');
const interfaceScript = document.createElement('script');
interfaceScript.src = interfaceChangeUrl;
interfaceScript.onload = () => interfaceScript.remove();
(document.head || document.documentElement)!.appendChild(interfaceScript);

// Inject ChatCustomizer script for chat customization
const chatCustomizerUrl = chrome.runtime.getURL('dist/ChatCustomizer.js');
const chatCustomizerScript = document.createElement('script');
chatCustomizerScript.src = chatCustomizerUrl;
chatCustomizerScript.onload = () => chatCustomizerScript.remove();
(document.head || document.documentElement)!.appendChild(chatCustomizerScript);

// Inject Worker patch and scripts on VOD and channel pages
const patchUrl = chrome.runtime.getURL('dist/patch_amazonworker.js');
const appUrl = chrome.runtime.getURL('dist/app.js');
const initUrl = chrome.runtime.getURL('dist/page_init.js');

// Inject page initializer with patch URL
const initScript = document.createElement('script');
initScript.src = initUrl;
initScript.dataset.patchUrl = patchUrl;
initScript.onload = () => initScript.remove();
(document.head || document.documentElement)!.appendChild(initScript);

// Inject Worker override script (for all pages, not just VOD)
const overrideScript = document.createElement('script');
overrideScript.src = appUrl;
overrideScript.onload = () => overrideScript.remove();
(document.head || document.documentElement)!.appendChild(overrideScript);

export {};

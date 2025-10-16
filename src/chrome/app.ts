declare const chrome: any;

// Set patch_url for app.ts in the page context
const chromeAny = (window as any).chrome;
(window as any).patch_url = chromeAny.runtime.getURL('dist/patch_amazonworker.js');
export {};

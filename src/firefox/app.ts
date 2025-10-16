declare const chrome: any;

// Fetch patch_url from page context
const patchUrl = localStorage.getItem('tns_internal_patch_url')!;

// Set in window for worker script
(window as any).patch_url = patchUrl;
export {};

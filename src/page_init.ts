// Page context initializer - reads patch URL from script data attribute
const currentScript = document.currentScript as HTMLScriptElement;
const patchUrl = currentScript?.dataset?.patchUrl;
if (patchUrl) {
  (window as any).patch_url = patchUrl;
  console.log('[TNS] Patch URL initialized:', patchUrl);
}
export {};

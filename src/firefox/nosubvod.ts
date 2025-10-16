export {}; // ensure this file is treated as a module to avoid global-scope conflicts

// Firefox content script sets patch URL via localStorage
const patchUrl = localStorage.getItem('tns_internal_patch_url')!;

declare const document: any;
declare const browser: any;
function injectScript(src: string) {
  const s = document.createElement('script');
  s.src = browser.runtime.getURL(src);
  s.onload = () => s.remove();
  (document.head || document.documentElement)!.append(s);
}

const extensionType = 'firefox';
console.log(`[TNS] Found extension type: ${extensionType}`);

injectScript(`dist/${extensionType}/app.js`);
injectScript('dist/app.js');
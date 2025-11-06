/**
 * Chat Customizer Bridge - Content Script
 * Communique les paramètres du storage vers le script injecté ChatCustomizer
 */

declare const chrome: any;

function loadAndSendSettings() {
  chrome.storage.sync.get('chatCustomization', (result: any) => {
    if (result.chatCustomization) {
      // Stocker dans window pour un accès immédiat par le script injecté
      (window as any).NSV_SETTINGS = result.chatCustomization;
      
      // Envoyer les paramètres au script injecté via window
      window.dispatchEvent(
        new CustomEvent('NSV_SETTINGS_UPDATED', {
          detail: result.chatCustomization,
        })
      );
      console.log('[NSV] Chat customization settings sent to injected script:', result.chatCustomization);
    }
  });
}

function setupChatCustomizerBridge() {
  // Charger les paramètres au démarrage
  loadAndSendSettings();

  // Écouter les changements de paramètres depuis la popup
  chrome.storage.onChanged.addListener((changes: any) => {
    if (changes.chatCustomization) {
      // Mettre à jour window.NSV_SETTINGS
      (window as any).NSV_SETTINGS = changes.chatCustomization.newValue;
      
      window.dispatchEvent(
        new CustomEvent('NSV_SETTINGS_UPDATED', {
          detail: changes.chatCustomization.newValue,
        })
      );
      console.log('[NSV] Chat customization settings updated:', changes.chatCustomization.newValue);
    }
  });
  
  // Écouter les demandes de rechargement des settings (lors de changement de page)
  window.addEventListener('NSV_RELOAD_SETTINGS', () => {
    console.log('[NSV] Settings reload requested');
    loadAndSendSettings();
  });
}

setupChatCustomizerBridge();

export {};

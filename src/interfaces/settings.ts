/**
 * settings.ts
 * Interface de configuration complète de l'extension NoSubVod
 */

declare const chrome: any;

import { storage, Settings } from '../utils/storage';
import { badgeManager, PRESET_BADGES } from '../utils/badge-manager';

// Types
interface FeatureSettings {
  'vod-unlocker': boolean;
  'interface-changer': boolean;
  'chat-customizer': boolean;
  'restriction-remover': boolean;
  'ad-blocker': boolean;
}

interface ChatCustomizationSettings {
  enableMyBadge: boolean;
  myBadgeText: string;
  myBadgeName?: string;
  enableMyEffect: boolean;
  myEffect: string;
}

// Effect CSS styles
const EFFECT_STYLES: Record<string, string> = {
  rainbow: 'background: linear-gradient(90deg, #ff0000, #ff7f00, #ffff00, #00ff00, #0000ff, #4b0082, #9400d3); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;',
  gradient_purple: 'background: linear-gradient(90deg, #9146FF, #c589f5); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;',
  gradient_ocean: 'background: linear-gradient(90deg, #00bfff, #0099ff); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;',
  gradient_fire: 'background: linear-gradient(90deg, #ff6b35, #ffa500); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;',
  gradient_sunset: 'background: linear-gradient(90deg, #ff6b6b, #ffd93d); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;',
  glitch: 'color: #fff; text-shadow: 2px 0 #ff0000, -2px 0 #00ffff, 0 0 5px rgba(255,0,255,0.5);',
  neon_blue: 'color: #00ffff; text-shadow: 0 0 10px rgba(0,255,255,0.8), 0 0 20px rgba(0,255,255,0.5);',
  neon_pink: 'color: #ff006e; text-shadow: 0 0 10px rgba(255,0,110,0.8), 0 0 20px rgba(255,0,110,0.5);'
};

class SettingsManager {
  private currentBadgeDataUrl: string = '';

  async init(): Promise<void> {
    await this.loadAllSettings();
    this.setupEventListeners();
    this.setupBadgeSelector();
  }

  /**
   * Load all settings from storage
   */
  private async loadAllSettings(): Promise<void> {
    // Load feature toggles
    const featureSettings = await this.loadFeatureSettings();
    this.applyFeatureSettings(featureSettings);

    // Load general settings
    const settings = await storage.getSettings();
    this.applyGeneralSettings(settings);

    // Load chat customization
    const chatSettings = await this.loadChatSettings();
    this.applyChatSettings(chatSettings);
  }

  /**
   * Load feature enable/disable states
   */
  private async loadFeatureSettings(): Promise<FeatureSettings> {
    return new Promise((resolve) => {
      chrome.storage.local.get('featureSettings', (result: any) => {
        const defaults: FeatureSettings = {
          'vod-unlocker': true,
          'interface-changer': true,
          'chat-customizer': true,
          'restriction-remover': true,
          'ad-blocker': true
        };
        resolve(result.featureSettings || defaults);
      });
    });
  }

  /**
   * Load chat customization settings
   */
  private async loadChatSettings(): Promise<ChatCustomizationSettings> {
    return new Promise((resolve) => {
      chrome.storage.local.get('chatCustomization', (result: any) => {
        const defaults: ChatCustomizationSettings = {
          enableMyBadge: false,
          myBadgeText: '',
          myBadgeName: '',
          enableMyEffect: false,
          myEffect: ''
        };
        resolve(result.chatCustomization || defaults);
      });
    });
  }

  /**
   * Apply feature settings to UI
   */
  private applyFeatureSettings(settings: FeatureSettings): void {
    Object.entries(settings).forEach(([featureId, enabled]) => {
      const checkbox = document.getElementById(`feature-${featureId}`) as HTMLInputElement;
      if (checkbox) {
        checkbox.checked = enabled;
      }
    });
  }

  /**
   * Apply general settings to UI
   */
  private applyGeneralSettings(settings: Settings): void {
    (document.getElementById('download-quality') as HTMLSelectElement).value = settings.defaultQuality;
    (document.getElementById('download-chunks') as HTMLInputElement).value = settings.downloadChunkSize.toString();
    (document.getElementById('download-compress') as HTMLInputElement).checked = settings.compressVideo || false;
    (document.getElementById('download-notifications') as HTMLInputElement).checked = settings.enableNotifications;
    (document.getElementById('download-thumbnails') as HTMLInputElement).checked = settings.showThumbnails;
    (document.getElementById('history-max') as HTMLInputElement).value = settings.maxHistoryItems.toString();
    (document.getElementById('history-cleanup') as HTMLInputElement).value = settings.autoCleanupDays.toString();
    (document.getElementById('advanced-debug') as HTMLInputElement).checked = settings.debugMode || false;
  }

  /**
   * Apply chat settings to UI
   */
  private applyChatSettings(settings: ChatCustomizationSettings): void {
    (document.getElementById('chat-badge-text') as HTMLInputElement).value = settings.myBadgeText || '';
    (document.getElementById('chat-badge-name') as HTMLInputElement).value = settings.myBadgeName || '';
    (document.getElementById('chat-effect-select') as HTMLSelectElement).value = settings.myEffect || '';

    // Show effect preview if effect is selected
    if (settings.myEffect) {
      this.updateEffectPreview(settings.myEffect);
    }

    // Store badge data URL if it's an image
    if (settings.myBadgeText && settings.myBadgeText.startsWith('data:')) {
      this.currentBadgeDataUrl = settings.myBadgeText;
      this.showImportedBadgePreview(settings.myBadgeText);
    }
  }

  /**
   * Setup event listeners
   */
  private setupEventListeners(): void {
    // Save button
    const saveBtn = document.getElementById('save-settings');
    saveBtn?.addEventListener('click', () => this.saveAllSettings());

    // Reset button
    const resetBtn = document.getElementById('reset-settings');
    resetBtn?.addEventListener('click', () => this.resetToDefaults());

    // Chat effect preview
    const effectSelect = document.getElementById('chat-effect-select') as HTMLSelectElement;
    effectSelect?.addEventListener('change', (e) => {
      const effect = (e.target as HTMLSelectElement).value;
      this.updateEffectPreview(effect);
    });

    // Badge file input
    const badgeFileInput = document.getElementById('badge-file-input') as HTMLInputElement;
    badgeFileInput?.addEventListener('change', (e) => this.handleBadgeUpload(e));

    // Feature toggles - update chat section visibility
    const chatCustomizerToggle = document.getElementById('feature-chat-customizer') as HTMLInputElement;
    chatCustomizerToggle?.addEventListener('change', (e) => {
      const chatSection = document.getElementById('chat-customization-section');
      if (chatSection) {
        chatSection.style.opacity = (e.target as HTMLInputElement).checked ? '1' : '0.5';
      }
    });
  }

  /**
   * Setup badge selector with presets
   */
  private async setupBadgeSelector(): Promise<void> {
    const container = document.getElementById('badge-presets');
    if (!container) return;

    // Add preset badges (now images from assets/badges/)
    PRESET_BADGES.forEach(badge => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'badge-btn';
      btn.title = badge.name;
      
      // Create image element for badge
      const img = document.createElement('img');
      // Convert relative path to Chrome extension URL
      if (badge.content.startsWith('assets/')) {
        img.src = chrome.runtime.getURL(badge.content);
      } else {
        img.src = badge.content;
      }
      img.alt = badge.name;
      btn.appendChild(img);
      
      btn.addEventListener('click', () => {
        // Deselect all
        container.querySelectorAll('.badge-btn').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
        
        // Update input with image path (keep relative path for storage)
        (document.getElementById('chat-badge-text') as HTMLInputElement).value = badge.content;
        (document.getElementById('chat-badge-name') as HTMLInputElement).value = badge.name;
        
        // Show preview
        this.showImportedBadgePreview(badge.content);
      });
      
      container.appendChild(btn);
    });

    // Load user's imported badges from badge manager
    const badges = await badgeManager.getAllBadges();
    const importedBadges = badges.filter(b => b.type === 'imported');
    
    importedBadges.forEach(badge => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'badge-btn';
      
      if (badge.content.startsWith('data:')) {
        const img = document.createElement('img');
        img.src = badge.content;
        btn.appendChild(img);
      } else {
        btn.textContent = badge.content;
      }
      
      btn.title = badge.name;
      
      btn.addEventListener('click', () => {
        container.querySelectorAll('.badge-btn').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
        
        (document.getElementById('chat-badge-text') as HTMLInputElement).value = badge.content;
        (document.getElementById('chat-badge-name') as HTMLInputElement).value = badge.name;
        
        if (badge.content.startsWith('data:')) {
          this.currentBadgeDataUrl = badge.content;
          this.showImportedBadgePreview(badge.content);
        }
      });
      
      container.appendChild(btn);
    });
  }

  /**
   * Update effect preview
   */
  private updateEffectPreview(effect: string): void {
    const previewContainer = document.getElementById('effect-preview-container');
    const preview = document.getElementById('effect-preview');
    
    if (!previewContainer || !preview) return;

    if (effect && EFFECT_STYLES[effect]) {
      previewContainer.style.display = 'block';
      preview.style.cssText = EFFECT_STYLES[effect];
    } else {
      previewContainer.style.display = 'none';
    }
  }

  /**
   * Handle badge file upload
   */
  private async handleBadgeUpload(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    
    if (!file) return;

    try {
      // Use badge manager to import the badge
      const badge = await badgeManager.importBadge(file);
      
      this.currentBadgeDataUrl = badge.content;
      this.showImportedBadgePreview(badge.content);
      
      // Update inputs
      (document.getElementById('chat-badge-text') as HTMLInputElement).value = badge.content;
      (document.getElementById('chat-badge-name') as HTMLInputElement).value = badge.name;
      
      // Add to badge selector
      const container = document.getElementById('badge-presets');
      if (container) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'badge-btn selected';
        
        const img = document.createElement('img');
        img.src = badge.content;
        btn.appendChild(img);
        btn.title = badge.name;
        
        btn.addEventListener('click', () => {
          container.querySelectorAll('.badge-btn').forEach(b => b.classList.remove('selected'));
          btn.classList.add('selected');
          
          (document.getElementById('chat-badge-text') as HTMLInputElement).value = badge.content;
          (document.getElementById('chat-badge-name') as HTMLInputElement).value = badge.name;
          this.currentBadgeDataUrl = badge.content;
          this.showImportedBadgePreview(badge.content);
        });
        
        container.appendChild(btn);
      }
      
      // Reset file input
      input.value = '';
    } catch (error) {
      console.error('[NSV Settings] Badge upload error:', error);
      this.showMessage('error', 'Erreur lors de l\'import du badge');
    }
  }

  /**
   * Show imported badge preview
   */
  private showImportedBadgePreview(imageSrc: string): void {
    const container = document.getElementById('badge-imported-container');
    const preview = document.getElementById('badge-preview');
    
    if (!container || !preview) return;

    preview.innerHTML = '';
    const img = document.createElement('img');
    
    // Convert relative paths to Chrome extension URLs for display
    if (imageSrc.startsWith('assets/')) {
      img.src = chrome.runtime.getURL(imageSrc);
    } else {
      img.src = imageSrc;
    }
    
    preview.appendChild(img);
    
    container.style.display = 'block';
  }

  /**
   * Hide imported badge preview
   */
  private hideImportedBadgePreview(): void {
    const container = document.getElementById('badge-imported-container');
    if (container) {
      container.style.display = 'none';
    }
  }

  /**
   * Save all settings
   */
  private async saveAllSettings(): Promise<void> {
    try {
      // Save feature settings
      const featureSettings: FeatureSettings = {
        'vod-unlocker': (document.getElementById('feature-vod-unlocker') as HTMLInputElement).checked,
        'interface-changer': (document.getElementById('feature-interface-changer') as HTMLInputElement).checked,
        'chat-customizer': (document.getElementById('feature-chat-customizer') as HTMLInputElement).checked,
        'restriction-remover': (document.getElementById('feature-restriction-remover') as HTMLInputElement).checked,
        'ad-blocker': (document.getElementById('feature-ad-blocker') as HTMLInputElement).checked
      };

      await new Promise<void>((resolve) => {
        chrome.storage.local.set({ featureSettings }, () => resolve());
      });

      // Save general settings
      const settings: Partial<Settings> = {
        defaultQuality: (document.getElementById('download-quality') as HTMLSelectElement).value,
        downloadChunkSize: parseInt((document.getElementById('download-chunks') as HTMLInputElement).value),
        compressVideo: (document.getElementById('download-compress') as HTMLInputElement).checked,
        enableNotifications: (document.getElementById('download-notifications') as HTMLInputElement).checked,
        showThumbnails: (document.getElementById('download-thumbnails') as HTMLInputElement).checked,
        maxHistoryItems: parseInt((document.getElementById('history-max') as HTMLInputElement).value),
        autoCleanupDays: parseInt((document.getElementById('history-cleanup') as HTMLInputElement).value),
        debugMode: (document.getElementById('advanced-debug') as HTMLInputElement).checked
      };

      await storage.saveSettings(settings);

      // Save chat customization
      const badgeText = (document.getElementById('chat-badge-text') as HTMLInputElement).value.trim();
      const badgeName = (document.getElementById('chat-badge-name') as HTMLInputElement).value.trim();
      const effect = (document.getElementById('chat-effect-select') as HTMLSelectElement).value;

      const chatSettings: ChatCustomizationSettings = {
        enableMyBadge: badgeText.length > 0,
        myBadgeText: badgeText,
        myBadgeName: badgeName,
        enableMyEffect: effect.length > 0,
        myEffect: effect
      };

      await new Promise<void>((resolve) => {
        chrome.storage.local.set({ chatCustomization: chatSettings }, () => resolve());
      });

      // Notify all Twitch tabs to reload settings
      this.notifyTwitchTabs(chatSettings);

      // Show success message
      this.showMessage('success', 'Paramètres enregistrés avec succès !');

      // Reload the extension if critical features changed
      if (!featureSettings['vod-unlocker'] || !featureSettings['interface-changer']) {
        setTimeout(() => {
          chrome.runtime.reload();
        }, 1500);
      }
    } catch (error) {
      console.error('[NSV Settings] Save error:', error);
      this.showMessage('error', 'Erreur lors de l\'enregistrement des paramètres');
    }
  }

  /**
   * Notify all Twitch tabs to reload settings
   */
  private notifyTwitchTabs(chatSettings: ChatCustomizationSettings): void {
    chrome.tabs.query({}, (tabs: any[]) => {
      tabs.forEach((tab: any) => {
        if (tab.url && tab.url.includes('twitch.tv')) {
          chrome.tabs.sendMessage(
            tab.id,
            { type: 'CHAT_CUSTOMIZATION_UPDATED', settings: chatSettings },
            () => {
              // Ignore errors (tab might not have content script)
              if (chrome.runtime.lastError) {
                return;
              }
            }
          );
        }
      });
    });
  }

  /**
   * Reset to default settings
   */
  private async resetToDefaults(): Promise<void> {
    if (!confirm('Êtes-vous sûr de vouloir réinitialiser tous les paramètres ?')) {
      return;
    }

    try {
      // Clear all settings
      await new Promise<void>((resolve) => {
        chrome.storage.local.remove(['featureSettings', 'chatCustomization'], () => resolve());
      });

      // Reset storage settings to defaults
      await storage.saveSettings({
        defaultQuality: 'Source',
        downloadChunkSize: 5,
        compressVideo: true,
        enableNotifications: true,
        showThumbnails: true,
        maxHistoryItems: 100,
        autoCleanupDays: 30,
        debugMode: false
      });

      // Reload settings
      await this.loadAllSettings();

      this.showMessage('success', 'Paramètres réinitialisés !');

      // Reload extension
      setTimeout(() => {
        chrome.runtime.reload();
      }, 1500);
    } catch (error) {
      console.error('[NSV Settings] Reset error:', error);
      this.showMessage('error', 'Erreur lors de la réinitialisation');
    }
  }

  /**
   * Show success or error message
   */
  private showMessage(type: 'success' | 'error', message: string): void {
    const msgEl = document.getElementById(`${type}-message`);
    if (!msgEl) return;

    msgEl.textContent = type === 'success' ? `✅ ${message}` : `❌ ${message}`;
    msgEl.classList.add('show');

    setTimeout(() => {
      msgEl.classList.remove('show');
    }, 3000);
  }
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
  const manager = new SettingsManager();
  manager.init();
  
  // Display version from manifest
  const versionEl = document.getElementById('version');
  if (versionEl) {
    try {
      const manifest = chrome.runtime.getManifest();
      if (manifest.version) {
        versionEl.textContent = 'v' + manifest.version;
      }
    } catch (e) {
      console.error('[NSV Settings] Could not read manifest version:', e);
    }
  }
});

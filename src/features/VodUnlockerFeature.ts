/**
 * VodUnlockerFeature.ts
 * Feature qui déverrouille les VODs réservées aux abonnés en patchant le Worker Amazon
 */

declare const chrome: any;

import { Feature, FeatureConfig, FeatureContext } from '../core/Feature';

export class VodUnlockerFeature extends Feature {
  private patchUrl: string = '';
  private originalWorker: any = null;

  constructor() {
    const config: FeatureConfig = {
      id: 'vod-unlocker',
      name: 'VOD Unlocker',
      description: 'Déverrouille les VODs réservées aux abonnés en patchant le Worker Amazon',
      version: '1.0.0',
      enabledByDefault: true,
      context: [FeatureContext.PAGE_SCRIPT],
      // Patch le Worker sur toutes les pages Twitch car on ne sait pas à l'avance où l'utilisateur ira
      // et le Worker doit être patché AVANT le chargement de la vidéo
      urlPatterns: [/^https?:\/\/(www\.)?twitch\.tv\//],
    };
    super(config);
  }

  protected async onInitialize(): Promise<void> {
    this.log('Initializing VOD unlocker');
    
    // Attendre que window.patch_url soit disponible (max 5 secondes)
    let attempts = 0;
    const maxAttempts = 50; // 50 * 100ms = 5 secondes
    
    while (!((window as any).patch_url) && attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 100));
      attempts++;
    }
    
    // Récupérer l'URL du patch depuis window (définie par inject-unified.ts)
    if ((window as any).patch_url) {
      this.patchUrl = (window as any).patch_url;
      this.log('Patch URL loaded:', this.patchUrl);
    } else {
      this.logError('Patch URL not available in window.patch_url after waiting');
    }
  }

  protected async onEnable(): Promise<void> {
    this.log('Enabling VOD unlocker');
    this.patchWorker();
  }

  protected async onDisable(): Promise<void> {
    this.log('Disabling VOD unlocker');
    this.restoreWorker();
  }

  protected async onDestroy(): Promise<void> {
    this.restoreWorker();
  }

  private patchWorker(): void {
    if (!this.patchUrl) {
      this.logError('Patch URL not available');
      return;
    }

    // Sauvegarder le Worker original
    this.originalWorker = (window as any).Worker;

    // Override Worker avec le patch
    try {
      const self = this;
      const patchUrl = this.patchUrl;
      
      (window as any).Worker = class PatchedWorker extends self.originalWorker {
        constructor(twitchBlobUrl: string) {
          // Solution: créer un Worker intermédiaire qui charge le patch puis le code Twitch
          // On utilise importScripts qui est synchrone dans les Workers
          const loaderCode = `
            // D'abord charger le patch
            try {
              importScripts('${patchUrl}');
              console.log('[NSV] Patch loaded in worker');
            } catch (err) {
              console.error('[NSV] Failed to load patch:', err);
            }
            
            // Ensuite charger le code Twitch original
            try {
              importScripts('${twitchBlobUrl.replace(/'/g, "\\'")}');
              console.log('[NSV] Twitch worker code loaded');
            } catch (err) {
              console.error('[NSV] Failed to load Twitch worker:', err);
            }
          `;
          
          const blob = new Blob([loaderCode], { type: 'application/javascript' });
          const patchedUrl = URL.createObjectURL(blob);
          
          super(patchedUrl);
        }
      };
      
      this.log('Worker patched successfully');
    } catch (e) {
      this.logError('Worker override setup failed', e);
    }
  }

  private restoreWorker(): void {
    if (this.originalWorker) {
      (window as any).Worker = this.originalWorker;
      this.log('Worker restored to original');
    }
  }
}

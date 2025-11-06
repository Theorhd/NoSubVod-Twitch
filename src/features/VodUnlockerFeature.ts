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
      (window as any).Worker = class Worker extends this.originalWorker {
        constructor(twitchBlobUrl: string) {
          let workerUrl = twitchBlobUrl;
          try {
            const escapedUrl = twitchBlobUrl.replace(/'/g, "%27");
            const req = new XMLHttpRequest();
            req.open('GET', escapedUrl, false);
            req.overrideMimeType("text/javascript");
            req.send();
            const wasmJs = req.responseText;
            
            // Injecter le patch
            const blobContent = `importScripts('${(window as any).NSV_PATCH_URL}');\n${wasmJs}`;
            const blob = new Blob([blobContent], { type: 'application/javascript' });
            workerUrl = URL.createObjectURL(blob);
          } catch (err) {
            console.error('[NSV] Worker patch failed, using original URL', err);
          }
          super(workerUrl);
        }
      };

      // Exposer l'URL du patch dans window pour le Worker
      (window as any).NSV_PATCH_URL = this.patchUrl;
      
      this.log('Worker patched successfully');
    } catch (e) {
      this.logError('Worker override setup failed', e);
    }
  }

  private restoreWorker(): void {
    if (this.originalWorker) {
      (window as any).Worker = this.originalWorker;
      delete (window as any).NSV_PATCH_URL;
      this.log('Worker restored to original');
    }
  }
}

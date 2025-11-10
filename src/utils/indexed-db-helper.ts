// Helper for IndexedDB operations
// IndexedDB has browser-dependent storage limits (typically ~60% of available disk space in Chrome)
// For large downloads (1400+ segments ~1.4GB+), ensure sufficient disk space is available
export class IndexedDBHelper {
  private dbName = 'NoSubVodDB';
  private storeName = 'downloads';
  private db: IDBDatabase | null = null;

  async init(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, 1);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(this.storeName)) {
          db.createObjectStore(this.storeName, { keyPath: 'id' });
        }
      };
    });
  }

  async storeSegment(downloadId: string, segmentIndex: number, buffer: ArrayBuffer): Promise<void> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([this.storeName], 'readwrite');
      const store = transaction.objectStore(this.storeName);
      const key = `${downloadId}_${segmentIndex}`;

      const request = store.put({ id: key, buffer });

      request.onsuccess = () => resolve();
      request.onerror = () => {
        const error = request.error;
        // Check for quota exceeded errors
        if (error && (error.name === 'QuotaExceededError' || error.name === 'NS_ERROR_DOM_QUOTA_REACHED')) {
          reject(new Error('Quota de stockage dépassé. Libérez de l\'espace disque et réessayez.'));
        } else {
          reject(error);
        }
      };
    });
  }

  async getSegment(downloadId: string, segmentIndex: number): Promise<ArrayBuffer | null> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([this.storeName], 'readonly');
      const store = transaction.objectStore(this.storeName);
      const key = `${downloadId}_${segmentIndex}`;

      const request = store.get(key);

      request.onsuccess = () => {
        const result = request.result;
        resolve(result ? result.buffer : null);
      };
      request.onerror = () => reject(request.error);
    });
  }

  async deleteDownload(downloadId: string, totalSegments: number): Promise<void> {
    if (!this.db) await this.init();

    const transaction = this.db!.transaction([this.storeName], 'readwrite');
    const store = transaction.objectStore(this.storeName);

    for (let i = 0; i < totalSegments; i++) {
      const key = `${downloadId}_${i}`;
      store.delete(key);
    }

    return new Promise((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  }

  // Check storage quota (returns estimated available space in bytes)
  async checkStorageQuota(): Promise<{ usage: number; quota: number; available: number }> {
    if ('storage' in navigator && 'estimate' in navigator.storage) {
      const estimate = await navigator.storage.estimate();
      const usage = estimate.usage || 0;
      const quota = estimate.quota || 0;
      const available = quota - usage;
      return { usage, quota, available };
    }
    // Fallback if storage API not available
    return { usage: 0, quota: Infinity, available: Infinity };
  }
}

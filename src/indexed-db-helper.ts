// Helper for IndexedDB operations
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
      request.onerror = () => reject(request.error);
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
}

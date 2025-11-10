// Storage manager for NoSubVod extension
declare const chrome: any;

export interface VodDownload {
  id: string;
  vodId: string;
  channel: string;
  title: string;
  quality: string;
  thumbnail: string;
  downloadDate: string;
  fileSize: number;
  segments: number;
  failedSegments: number;
  duration: number; // in seconds
  success: boolean;
}

export interface Settings {
  defaultQuality: string; // '1080p60', '720p60', etc.
  defaultFileFormat: 'ts' | 'mp4';
  enableNotifications: boolean;
  autoCleanupDays: number; // 0 = disabled
  showThumbnails: boolean;
  maxHistoryItems: number;
  downloadChunkSize: number;
  theme: 'dark' | 'light' | 'auto';
  debugMode: boolean;
  compressVideo: boolean; // Compress video to reduce file size
}

export interface ActiveDownload {
  downloadId: string;
  vodInfo: any;
  qualityLabel: string;
  startTime: number;
  progress: {
    percent: number;
    current: number;
    total: number;
    speed: number;
    downloadedBytes: number;
  };
}

const DEFAULT_SETTINGS: Settings = {
  defaultQuality: 'Source',
  defaultFileFormat: 'ts',
  enableNotifications: true,
  autoCleanupDays: 30,
  showThumbnails: true,
  maxHistoryItems: 100,
  downloadChunkSize: 5,
  theme: 'dark',
  debugMode: false,
  compressVideo: true
};

class StorageManager {
  // Get settings from storage
  async getSettings(): Promise<Settings> {
    return new Promise((resolve) => {
      chrome.storage.local.get(['settings'], (result: any) => {
        resolve({ ...DEFAULT_SETTINGS, ...result.settings });
      });
    });
  }

  // Save settings to storage
  async saveSettings(settings: Partial<Settings>): Promise<void> {
    const current = await this.getSettings();
    const updated = { ...current, ...settings };
    return new Promise((resolve) => {
      chrome.storage.local.set({ settings: updated }, () => resolve());
    });
  }

  // Get download history
  async getHistory(): Promise<VodDownload[]> {
    return new Promise((resolve) => {
      chrome.storage.local.get(['history'], (result: any) => {
        resolve(result.history || []);
      });
    });
  }

  // Add a download to history
  async addToHistory(download: VodDownload): Promise<void> {
    const history = await this.getHistory();
    const settings = await this.getSettings();
    
    // Add to beginning of array
    history.unshift(download);
    
    // Limit history size
    const limited = history.slice(0, settings.maxHistoryItems);
    
    return new Promise((resolve) => {
      chrome.storage.local.set({ history: limited }, () => resolve());
    });
  }

  // Clear history
  async clearHistory(): Promise<void> {
    return new Promise((resolve) => {
      chrome.storage.local.set({ history: [] }, () => resolve());
    });
  }

  // Remove old downloads based on settings
  async cleanupOldDownloads(): Promise<number> {
    const settings = await this.getSettings();
    if (settings.autoCleanupDays === 0) return 0;

    const history = await this.getHistory();
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - settings.autoCleanupDays);

    const filtered = history.filter(item => {
      const itemDate = new Date(item.downloadDate);
      return itemDate >= cutoffDate;
    });

    const removed = history.length - filtered.length;
    if (removed > 0) {
      await new Promise<void>((resolve) => {
        chrome.storage.local.set({ history: filtered }, () => resolve());
      });
    }

    return removed;
  }

  // Get storage usage stats
  async getStorageStats(): Promise<{ used: number; total: number }> {
    return new Promise((resolve) => {
      chrome.storage.local.getBytesInUse(null, (bytes: number) => {
        // Chrome storage limit is typically 10MB for local storage
        resolve({ used: bytes, total: 10485760 });
      });
    });
  }

  // Active download management
  async getActiveDownload(): Promise<ActiveDownload | null> {
    return new Promise((resolve) => {
      chrome.storage.local.get(['activeDownload'], (result: any) => {
        resolve(result.activeDownload || null);
      });
    });
  }

  async setActiveDownload(download: ActiveDownload | null): Promise<void> {
    return new Promise((resolve) => {
      chrome.storage.local.set({ activeDownload: download }, () => resolve());
    });
  }

  async clearActiveDownload(): Promise<void> {
    return this.setActiveDownload(null);
  }
}

export const storage = new StorageManager();

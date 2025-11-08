/**
 * storage-adapter.ts
 * Adaptateur pour utiliser le storage existant avec le FeatureManager
 */

import { FeatureStorage } from './FeatureManager';

declare const chrome: any;

/**
 * Adaptateur pour utiliser le storage Chrome avec le système de features
 */
export class ChromeStorageAdapter implements FeatureStorage {
  async get(key: string): Promise<any> {
    return new Promise((resolve) => {
      chrome.storage.local.get(key, (result: any) => {
        resolve(result[key]);
      });
    });
  }

  async set(key: string, value: any): Promise<void> {
    return new Promise<void>((resolve) => {
      chrome.storage.local.set({ [key]: value }, () => {
        resolve();
      });
    });
  }

  async remove(key: string): Promise<void> {
    return new Promise<void>((resolve) => {
      chrome.storage.local.remove(key, () => {
        resolve();
      });
    });
  }
}

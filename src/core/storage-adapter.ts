/**
 * storage-adapter.ts
 * Adaptateur pour utiliser le storage existant avec le FeatureManager
 */

import { FeatureStorage } from './FeatureManager';
import { storage } from '../utils/storage';

/**
 * Adaptateur pour utiliser le storage Chrome avec le système de features
 */
export class ChromeStorageAdapter implements FeatureStorage {
  private prefix: string;

  constructor(prefix: string = 'nsv_') {
    this.prefix = prefix;
  }

  async get(key: string): Promise<any> {
    const settings = await storage.getSettings();
    const fullKey = this.prefix + key;
    return (settings as any)[fullKey];
  }

  async set(key: string, value: any): Promise<void> {
    const settings = await storage.getSettings();
    const fullKey = this.prefix + key;
    (settings as any)[fullKey] = value;
    await storage.saveSettings(settings);
  }

  async remove(key: string): Promise<void> {
    const settings = await storage.getSettings();
    const fullKey = this.prefix + key;
    delete (settings as any)[fullKey];
    await storage.saveSettings(settings);
  }
}

/**
 * Badge Manager - Gère les badges prédéfinis et importés
 */

declare const chrome: any;

export interface Badge {
  id: string;
  type: 'preset' | 'imported' | 'emoji';
  content: string; // emoji, text, ou base64 image
  name: string;
}

export const PRESET_BADGES: Badge[] = [
  // Badges officiels Twitch depuis assets/badges/
  { id: 'badge_founder', type: 'preset', content: 'assets/badges/Founder.png', name: 'Founder' },
  { id: 'badge_glhf', type: 'preset', content: 'assets/badges/GLHF Pledge.png', name: 'GLHF Pledge' },
  { id: 'badge_glitchcon', type: 'preset', content: 'assets/badges/GlitchCon 2020.png', name: 'GlitchCon 2020' },
  { id: 'badge_anonymous', type: 'preset', content: 'assets/badges/Anonymous Cheerer.png', name: 'Anonymous Cheerer' },
  { id: 'badge_bits1', type: 'preset', content: 'assets/badges/Bits Leader 1.png', name: 'Bits Leader 1' },
  { id: 'badge_bits2', type: 'preset', content: 'assets/badges/Bits Leader 2.png', name: 'Bits Leader 2' },
  { id: 'badge_bits3', type: 'preset', content: 'assets/badges/Bits Leader 3.png', name: 'Bits Leader 3' },
  { id: 'badge_60seconds', type: 'preset', content: 'assets/badges/60 Seconds!.png', name: '60 Seconds!' },
  { id: 'badge_okhlos', type: 'preset', content: 'assets/badges/Okhlos.png', name: 'Okhlos' },
  { id: 'badge_minecraft', type: 'preset', content: 'assets/badges/Minecraft 15th Anniversary Celebration.png', name: 'Minecraft 15th Anniversary' },
  { id: 'badge_owl2018', type: 'preset', content: 'assets/badges/OWL All-Access Pass 2018.png', name: 'OWL All-Access Pass 2018' },
  { id: 'badge_owl2019', type: 'preset', content: 'assets/badges/OWL All-Access Pass 2019.png', name: 'OWL All-Access Pass 2019' },
  { id: 'badge_twitchcon2017', type: 'preset', content: 'assets/badges/TwitchCon 2017 - Long Beach.png', name: 'TwitchCon 2017 - Long Beach' },
  { id: 'badge_twitchcon2018', type: 'preset', content: 'assets/badges/TwitchCon 2018 - San Jose.png', name: 'TwitchCon 2018 - San Jose' },
  { id: 'badge_twitchcon2019', type: 'preset', content: 'assets/badges/TwitchCon 2019 - Berlin.png', name: 'TwitchCon 2019 - Berlin' },
];

export class BadgeManager {
  private storageKey = 'chatBadges';

  /**
   * Obtenir tous les badges (prédéfinis + importés)
   */
  async getAllBadges(): Promise<Badge[]> {
    const imported = await this.getImportedBadges();
    return [...PRESET_BADGES, ...imported];
  }

  /**
   * Obtenir les badges importés
   */
  async getImportedBadges(): Promise<Badge[]> {
    return new Promise((resolve) => {
      chrome.storage.local.get([this.storageKey], (result: any) => {
        resolve(result[this.storageKey] || []);
      });
    });
  }

  /**
   * Ajouter un badge importé
   */
  async importBadge(file: File): Promise<Badge> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      
      reader.onload = async (e) => {
        try {
          const base64 = e.target?.result as string;
          const id = `imported_${Date.now()}_${Math.random().toString(36).substring(7)}`;
          
          const badge: Badge = {
            id,
            type: 'imported',
            content: base64,
            name: file.name.split('.')[0] || 'Badge Importé'
          };

          // Sauvegarder
          const imported = await this.getImportedBadges();
          imported.push(badge);
          
          chrome.storage.local.set({ [this.storageKey]: imported }, () => {
            console.log('[NSV] Badge imported:', badge.name);
            resolve(badge);
          });
        } catch (err) {
          reject(err);
        }
      };

      reader.onerror = () => {
        reject(new Error('Erreur lors de la lecture du fichier'));
      };

      reader.readAsDataURL(file);
    });
  }

  /**
   * Supprimer un badge importé
   */
  async deleteBadge(badgeId: string): Promise<void> {
    const imported = await this.getImportedBadges();
    const filtered = imported.filter(b => b.id !== badgeId);
    
    return new Promise((resolve) => {
      chrome.storage.local.set({ [this.storageKey]: filtered }, () => {
        console.log('[NSV] Badge deleted:', badgeId);
        resolve();
      });
    });
  }

  /**
   * Obtenir le contenu d'un badge
   */
  async getBadgeContent(badgeId: string): Promise<string | null> {
    const all = await this.getAllBadges();
    const badge = all.find(b => b.id === badgeId);
    return badge ? badge.content : null;
  }
}

export const badgeManager = new BadgeManager();

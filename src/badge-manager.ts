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
  // Emojis courants
  { id: 'emoji_crown', type: 'emoji', content: '👑', name: 'Couronne' },
  { id: 'emoji_star', type: 'emoji', content: '⭐', name: 'Étoile' },
  { id: 'emoji_heart', type: 'emoji', content: '❤️', name: 'Cœur' },
  { id: 'emoji_fire', type: 'emoji', content: '🔥', name: 'Feu' },
  { id: 'emoji_gem', type: 'emoji', content: '💎', name: 'Diamant' },
  { id: 'emoji_trophy', type: 'emoji', content: '🏆', name: 'Trophée' },
  { id: 'emoji_bolt', type: 'emoji', content: '⚡', name: 'Éclair' },
  { id: 'emoji_sword', type: 'emoji', content: '⚔️', name: 'Épée' },
  { id: 'emoji_shield', type: 'emoji', content: '🛡️', name: 'Bouclier' },
  { id: 'emoji_dragon', type: 'emoji', content: '🐉', name: 'Dragon' },
  { id: 'emoji_phoenix', type: 'emoji', content: '🔆', name: 'Phénix' },
  { id: 'emoji_moon', type: 'emoji', content: '🌙', name: 'Lune' },
  { id: 'emoji_sun', type: 'emoji', content: '☀️', name: 'Soleil' },
  { id: 'emoji_snowflake', type: 'emoji', content: '❄️', name: 'Flocon' },
  { id: 'emoji_wave', type: 'emoji', content: '🌊', name: 'Vague' },
  { id: 'emoji_skull', type: 'emoji', content: '💀', name: 'Crâne' },
  
  // Badges style Twitch
  { id: 'twitch_bits', type: 'preset', content: '[BITS]', name: 'Bits' },
  { id: 'twitch_vip', type: 'preset', content: '[VIP]', name: 'VIP' },
  { id: 'twitch_mod', type: 'preset', content: '[MOD]', name: 'Modérateur' },
  { id: 'twitch_sub', type: 'preset', content: '[SUB]', name: 'Abonné' },
  { id: 'twitch_prime', type: 'preset', content: '[PRIME]', name: 'Prime' },
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

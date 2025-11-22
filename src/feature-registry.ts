/**
 * feature-registry.ts
 * Registre centralisé de toutes les features disponibles
 * Facilite l'ajout et la gestion des features
 */

import { Feature } from './core/Feature';
import {
  VodUnlockerFeature,
  InterfaceChangerFeature,
  ChatCustomizerFeature,
  RestrictionRemoverFeature,
  AdBlockerFeature,
  TwitchSkinChanger,
} from './features';

/**
 * Interface pour la définition d'une feature dans le registre
 */
export interface FeatureDefinition {
  /** Classe de la feature */
  featureClass: new () => Feature;
  
  /** Catégorie de la feature (pour l'organisation) */
  category: 'core' | 'ui' | 'chat' | 'download' | 'experimental';
  
  /** Tags pour la recherche et le filtrage */
  tags: string[];
}

/**
 * Registre de toutes les features disponibles
 * Pour ajouter une nouvelle feature, ajoutez simplement une entrée ici
 */
export const FEATURE_REGISTRY: FeatureDefinition[] = [
  // === CORE FEATURES ===
  {
    featureClass: VodUnlockerFeature,
    category: 'core',
    tags: ['vod', 'unlock', 'subscriber', 'essential']
  },
  {
    featureClass: AdBlockerFeature,
    category: 'core',
    tags: ['ads', 'blocker', 'skip', 'essential', 'performance']
  },

  // === UI FEATURES ===
  {
    featureClass: InterfaceChangerFeature,
    category: 'ui',
    tags: ['interface', 'button', 'subscribe', 'ui']
  },
  {
    featureClass: RestrictionRemoverFeature,
    category: 'ui',
    tags: ['restriction', 'overlay', 'badge', 'ui']
  },

  // === CHAT FEATURES ===
  {
    featureClass: ChatCustomizerFeature,
    category: 'chat',
    tags: ['chat', 'badge', 'effect', 'customization']
  },

  // === UI CUSTOMIZATION ===
  {
    featureClass: TwitchSkinChanger,
    category: 'ui',
    tags: ['theme', 'colors', 'skin', 'customization', 'appearance']
  },

];

/**
 * Récupère toutes les features d'une catégorie
 */
export function getFeaturesByCategory(category: FeatureDefinition['category']): FeatureDefinition[] {
  return FEATURE_REGISTRY.filter(def => def.category === category);
}

/**
 * Récupère toutes les features avec un tag spécifique
 */
export function getFeaturesByTag(tag: string): FeatureDefinition[] {
  return FEATURE_REGISTRY.filter(def => def.tags.includes(tag));
}

/**
 * Instancie toutes les features du registre
 */
export function instantiateAllFeatures(): Feature[] {
  return FEATURE_REGISTRY.map(def => new def.featureClass());
}

/**
 * Instancie les features d'une catégorie
 */
export function instantiateFeaturesByCategory(category: FeatureDefinition['category']): Feature[] {
  return getFeaturesByCategory(category).map(def => new def.featureClass());
}

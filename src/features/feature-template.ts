/**
 * feature-template.ts
 * 
 * TEMPLATE pour créer une nouvelle feature
 * 
 * Instructions:
 * 1. Copiez ce fichier dans src/features/
 * 2. Renommez-le avec le nom de votre feature (ex: MyAwesomeFeature.ts)
 * 3. Remplacez tous les PLACEHOLDERS ci-dessous
 * 4. Implémentez votre logique dans les méthodes
 * 5. Exportez la feature dans src/features/index.ts
 * 6. Enregistrez-la dans src/feature-registry.ts
 * 7. Compilez avec npm run build
 * 
 * PLACEHOLDERS à remplacer:
 * - FEATURE_ID: Identifiant unique en kebab-case (ex: 'my-awesome-feature')
 * - FEATURE_NAME: Nom lisible (ex: 'My Awesome Feature')
 * - FEATURE_DESCRIPTION: Description courte
 * - FEATURE_VERSION: Version sémantique (ex: '1.0.0')
 * - FEATURE_CONTEXT: Contexte d'exécution (PAGE_SCRIPT, CONTENT_SCRIPT, etc.)
 * - FeatureClassName: Nom de votre classe en PascalCase (ex: MyAwesomeFeature)
 */

import { Feature, FeatureConfig, FeatureContext } from '../core/Feature';

/**
 * FeatureClassName
 * FEATURE_DESCRIPTION
 */
export class FeatureClassName extends Feature {
  // Vos propriétés privées ici
  // private myProperty: any;

  constructor() {
    const config: FeatureConfig = {
      id: 'FEATURE_ID',                              // Identifiant unique (kebab-case)
      name: 'FEATURE_NAME',                          // Nom lisible
      description: 'FEATURE_DESCRIPTION',            // Description
      version: 'FEATURE_VERSION',                    // Version (ex: '1.0.0')
      enabledByDefault: true,                        // true = activée par défaut
      context: [FeatureContext.PAGE_SCRIPT],         // Où s'exécute la feature (PAGE_SCRIPT, CONTENT_SCRIPT, BACKGROUND, POPUP, DOWNLOAD_PAGE)
      
      // OPTIONNEL : Patterns d'URL où la feature doit s'exécuter
      // urlPatterns: [
      //   /^https?:\/\/(www\.)?twitch\.tv\/videos\//,
      //   /^https?:\/\/(www\.)?twitch\.tv\/[^/]+$/
      // ],
      
      // OPTIONNEL : Dépendances vers d'autres features
      // dependencies: ['other-feature-id'],
    };
    super(config);
  }

  /**
   * Initialisation de la feature (appelée une seule fois au démarrage)
   * Utilisez cette méthode pour :
   * - Créer des éléments DOM statiques
   * - Initialiser des variables
   * - Charger des ressources
   */
  protected async onInitialize(): Promise<void> {
    this.log('Initializing');
    
    // Votre code d'initialisation ici
    
    // Exemple :
    // this.myProperty = await this.loadSettings();
  }

  /**
   * Activation de la feature
   * Utilisez cette méthode pour :
   * - Démarrer des observers
   * - Ajouter des event listeners
   * - Activer des timers/intervals
   * - Modifier le DOM de manière dynamique
   */
  protected async onEnable(): Promise<void> {
    this.log('Enabling');
    
    // Votre code d'activation ici
    
    // Exemple avec un MutationObserver :
    // this.startObserver();
    
    // Exemple avec un event listener :
    // document.addEventListener('click', this.handleClick.bind(this));
    
    // Exemple avec un interval :
    // this.intervalId = setInterval(() => this.doSomething(), 1000);
  }

  /**
   * Désactivation de la feature
   * Utilisez cette méthode pour :
   * - Arrêter des observers
   * - Retirer des event listeners
   * - Arrêter des timers/intervals
   * - Cacher/supprimer des éléments DOM ajoutés
   * 
   * IMPORTANT : Nettoyez toutes les ressources pour éviter les fuites mémoire
   */
  protected async onDisable(): Promise<void> {
    this.log('Disabling');
    
    // Votre code de désactivation ici
    
    // Exemple :
    // this.stopObserver();
    // document.removeEventListener('click', this.handleClick);
    // if (this.intervalId) clearInterval(this.intervalId);
  }

  /**
   * Destruction de la feature (nettoyage final)
   * Utilisez cette méthode pour :
   * - Libérer toutes les ressources
   * - Supprimer les références pour garbage collection
   * 
   * Note : onDisable() est appelé automatiquement avant onDestroy()
   */
  protected async onDestroy(): Promise<void> {
    // Votre code de destruction ici
    
    // Exemple :
    // this.myProperty = null;
  }

  // ============================================================
  // Méthodes privées (exemples)
  // ============================================================

  /**
   * Exemple : Démarrer un MutationObserver
   */
  // private startObserver(): void {
  //   if (!document.body) {
  //     setTimeout(() => this.startObserver(), 100);
  //     return;
  //   }

  //   this.observer = new MutationObserver((mutations) => {
  //     mutations.forEach((mutation) => {
  //       mutation.addedNodes.forEach((node) => {
  //         if (node.nodeType === Node.ELEMENT_NODE) {
  //           this.processNode(node as Element);
  //         }
  //       });
  //     });
  //   });

  //   this.observer.observe(document.body, {
  //     childList: true,
  //     subtree: true
  //   });

  //   this.log('Observer started');
  // }

  /**
   * Exemple : Arrêter le MutationObserver
   */
  // private stopObserver(): void {
  //   if (this.observer) {
  //     this.observer.disconnect();
  //     this.observer = null;
  //     this.log('Observer stopped');
  //   }
  // }

  /**
   * Exemple : Traiter un noeud du DOM
   */
  // private processNode(node: Element): void {
  //   // Votre logique ici
  // }

  /**
   * Exemple : Event handler
   */
  // private handleClick(event: MouseEvent): void {
  //   // Votre logique ici
  // }
}

// ============================================================
// APRÈS AVOIR CRÉÉ VOTRE FEATURE
// ============================================================

// 1. Exportez-la dans src/features/index.ts :
//    export * from './FeatureClassName';

// 2. Enregistrez-la dans src/feature-registry.ts :
//    import { FeatureClassName } from './features';
//    
//    export const FEATURE_REGISTRY: FeatureDefinition[] = [
//      // ... autres features
//      {
//        featureClass: FeatureClassName,
//        category: 'ui',  // ou 'core', 'chat', 'download', 'experimental'
//        tags: ['tag1', 'tag2']
//      },
//    ];

// 3. Compilez :
//    npm run build

// 4. Testez dans la console :
//    NSV.listFeatures()
//    NSV.getFeatureInfo('FEATURE_ID')
//    NSV.toggleFeature('FEATURE_ID', true)

// ============================================================
// BONNES PRATIQUES
// ============================================================

// ✅ Utilisez this.log() au lieu de console.log()
// ✅ Gérez les erreurs avec try/catch et this.logError()
// ✅ Nettoyez TOUTES les ressources dans onDisable/onDestroy
// ✅ Testez l'activation, la désactivation, puis la réactivation
// ✅ Documentez votre code
// ✅ Utilisez des types TypeScript stricts
// ✅ Respectez les conventions de nommage
// ✅ Gardez la logique dans la feature (pas dans le manager)

// ============================================================
// RESSOURCES
// ============================================================

// Documentation : FEATURES.md
// Exemples : src/features/VodUnlockerFeature.ts, InterfaceChangerFeature.ts
// Architecture : ARCHITECTURE_DIAGRAM.md

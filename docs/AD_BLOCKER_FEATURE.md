# 🚫 Ad Blocker/Skipper Feature

## Description

La fonctionnalité **Ad Blocker/Skipper** bloque ou passe automatiquement les publicités Twitch pour améliorer l'expérience utilisateur. Elle détecte et masque les overlays publicitaires, accélère la lecture des publicités et clique automatiquement sur les boutons "Skip".

## Priorité

**HAUTE** - Cette fonctionnalité est très demandée par les utilisateurs.

## Fonctionnalités principales

### 1. 🎯 Détection automatique des publicités

- Détecte les overlays publicitaires (`[data-a-target="video-ad-label"]`)
- Identifie les messages "Ad in progress"
- Repère les conteneurs publicitaires et les comptes à rebours
- Analyse les sources vidéo pour détecter les URLs publicitaires

### 2. 🚀 Accélération des publicités

- Accélère la lecture des publicités détectées (x16)
- Met automatiquement en sourdine pendant les pubs
- Réduit drastiquement le temps d'attente

### 3. ⏭️ Skip automatique

- Clique automatiquement sur le bouton "Skip Ad" dès qu'il apparaît
- Vérifie toutes les 500ms pour une réactivité maximale

### 4. 🎨 Masquage des overlays

- Cache tous les éléments visuels publicitaires
- Injecte des styles CSS pour masquer :
  - Labels de publicité
  - Conteneurs publicitaires
  - Comptes à rebours
  - Banners publicitaires
  - Messages "Ad in progress"

### 5. 📊 Notification visuelle

- Affiche un message personnalisé "🚫 Publicité bloquée par NoSubVod"
- Animation de fondu élégante
- Disparaît automatiquement après 3 secondes

## Architecture technique

### Structure

```
AdBlockerFeature
├── Observer DOM (MutationObserver)
├── Interval de vérification (500ms)
├── Injection de styles CSS
├── Gestion des éléments vidéo
└── API publique
```

### Méthodes principales

#### `checkAndHandleAds()`

Fonction centrale appelée toutes les 500ms pour :

- Masquer les overlays publicitaires
- Cliquer sur les boutons skip
- Gérer les vidéos publicitaires
- Détecter et traiter les pubs en cours

#### `hideAdOverlays()`

Masque tous les éléments publicitaires trouvés dans le DOM.

#### `handleVideoAds()`

Accélère la lecture des vidéos publicitaires détectées dans les sources vidéo.

#### `clickSkipButton()`

Clique automatiquement sur le bouton "Skip Ad" s'il est présent et visible.

### Sélecteurs CSS utilisés

```typescript
{
  adOverlay: '[data-a-target="video-ad-label"]',
  adContainer: '.video-ads__container',
  adInProgress: '[data-a-target="player-ad-notice"]',
  adCountdown: '.video-ads__countdown',
  adBanner: '[data-test-selector="ad-banner"]',
  skipButton: '[data-a-target="player-overlay-skip-ad"]',
}
```

## Configuration

### Feature Config

```typescript
{
  id: 'ad-blocker',
  name: 'Ad Blocker/Skipper',
  description: '🚫 Bloque ou passe automatiquement les publicités Twitch...',
  version: '1.0.0',
  enabledByDefault: true,
  context: [FeatureContext.PAGE_SCRIPT, FeatureContext.CONTENT_SCRIPT],
  urlPatterns: [
    /^https?:\/\/(www\.)?twitch\.tv\/[^/]+$/,        // Streams live
    /^https?:\/\/(www\.)?twitch\.tv\/videos\//,      // VODs
  ],
}
```

### Activation/Désactivation

Dans la console ou via l'API NSV :

```javascript
// Activer
NSV.toggleFeature("ad-blocker", true);

// Désactiver
NSV.toggleFeature("ad-blocker", false);

// Vérifier l'état
NSV.getFeatureInfo("ad-blocker");

// Forcer une vérification
NSV.features["ad-blocker"].forceAdCheck();

// Obtenir les statistiques
NSV.features["ad-blocker"].getStats();
```

## Utilisation

### Installation

1. La feature est **activée par défaut** après installation de l'extension
2. Elle s'active automatiquement sur les pages de stream et VOD
3. Aucune configuration nécessaire

### Désactivation temporaire

Si vous souhaitez voir les publicités (pour soutenir un streamer) :

```javascript
NSV.toggleFeature("ad-blocker", false);
```

### Réactivation

```javascript
NSV.toggleFeature("ad-blocker", true);
```

## Styles CSS injectés

La feature injecte automatiquement des styles pour masquer les éléments publicitaires :

```css
/* Masquer les overlays publicitaires */
[data-a-target="video-ad-label"],
.video-ads__container,
[data-a-target="player-ad-notice"],
.video-ads__countdown,
[data-test-selector="ad-banner"],
.video-ads,
.ads-wrapper {
  display: none !important;
  opacity: 0 !important;
  visibility: hidden !important;
  pointer-events: none !important;
}

/* Message personnalisé pendant le blocage */
.nsv-ad-blocked-notice {
  /* Animation de fondu élégante */
}
```

## Performance

### Optimisations

- **Vérification limitée** : max 1 vérification intensive toutes les 100ms
- **MutationObserver** optimisé avec filtres d'attributs
- **Interval léger** : vérifications toutes les 500ms
- **Nettoyage automatique** : suppression du message après 3s

### Impact mémoire

- Très faible (< 1MB)
- Nettoyage automatique des ressources lors de la désactivation

## Limitations connues

1. **Publicités serveur-side** : Certaines publicités insérées côté serveur peuvent ne pas être détectables
2. **Nouveaux formats** : Twitch peut changer les sélecteurs CSS, nécessitant une mise à jour
3. **Délai minimal** : Un court délai (< 1 seconde) peut exister avant la détection

## Améliorations futures

### TODO

- [ ] Ajouter un compteur de publicités bloquées
- [ ] Statistiques détaillées (temps économisé, nombre de pubs)
- [ ] Options de configuration (vitesse d'accélération, affichage du message)
- [ ] Support des publicités mid-roll
- [ ] Détection avancée des publicités serveur-side
- [ ] Mode "Soutenir le streamer" (désactivation temporaire avec rappel)

## Compatibilité

### Navigateurs

- ✅ Chrome/Chromium
- ✅ Edge
- ✅ Brave
- ✅ Opera
- ⚠️ Firefox (nécessite adaptation manifest v2)

### Pages Twitch

- ✅ Streams live (`twitch.tv/[channel]`)
- ✅ VODs (`twitch.tv/videos/[id]`)
- ❌ Clips (non concernés par les pubs)

## Conformité

### Éthique

Cette fonctionnalité est fournie à des fins éducatives. Les utilisateurs sont encouragés à soutenir leurs streamers préférés par d'autres moyens (abonnements, dons, etc.).

### Politique Twitch

⚠️ **Important** : L'utilisation de bloqueurs de publicités peut être contraire aux conditions d'utilisation de Twitch. Utilisez cette fonctionnalité à vos propres risques.

## Support

Pour signaler un bug ou proposer une amélioration :

1. Ouvrez une issue sur GitHub
2. Décrivez le comportement observé
3. Fournissez les logs de la console (`[NSV:ad-blocker]`)

## Logs de debug

Les logs sont préfixés avec `[NSV:ad-blocker]` :

```
[NSV:ad-blocker] Initializing Ad Blocker
[NSV:ad-blocker] Observer started
[NSV:ad-blocker] Ad detected and being handled
[NSV:ad-blocker] Clicked skip button
[NSV:ad-blocker] Accelerated ad playback
```

## Licence

Voir le fichier LICENSE à la racine du projet.

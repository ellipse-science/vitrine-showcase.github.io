# Vitrine — application iOS

Coquille native pour `vitrinedemocratique.com`. C'est l'équivalent de la version
« Sur l'écran d'accueil » de Safari, avec ce que le web ne peut pas faire sur iOS.

> ⚠️ **Ce code n'a jamais été compilé.** Il a été écrit sous Linux, sans Xcode,
> sans simulateur et sans appareil. Voir [« Ce qui n'a pas été vérifié »](#ce-qui-na-pas-été-vérifié)
> avant d'y accorder la moindre confiance. La première compilation demandera
> probablement quelques retouches.

## Ce que ça fait

| | |
|---|---|
| **Le site, plein cadre** | `WKWebView` sans chrome de navigateur, geste de retour activé, tirer pour actualiser. |
| **Liens sortants** | Le site pose 21 liens `target="_blank"` (Polimètre, ellipse.science, réseaux sociaux) et renvoie vers les médias. Ils s'ouvrent dans `SFSafariViewController`. **Sans ce traitement, ces liens ne feraient rien du tout** : c'est le défaut classique des applications qui enveloppent un site. |
| **Nouvelle édition** | Sonde `build-id.json`, comme `ActualisationAuto` côté web. Retour dans l'application : rechargement silencieux. En pleine lecture : un bandeau, jamais un rechargement sous les yeux. |
| **Hors ligne** | Écran natif avec « Réessayer ». Le service worker du site continue de servir sa copie. |
| **Tuile d'écran d'accueil** | La Une du bloc courant, en petit et moyen format. Cible séparée, retirable. |

Aucun appel à `api.vitrinedemocratique.com`. L'application lit les deux mêmes
fichiers publics servis par le CDN que le site lui-même : `build-id.json`
(~100 octets) et `data/hero-selection.json` (~330 octets). La règle du coût nul
sous afflux vaut pour l'application comme pour la page.

## Construire

Il faut un Mac avec Xcode 15 ou plus récent (cible : iOS 17).

```sh
brew install xcodegen
cd ios
xcodegen generate     # produit Vitrine.xcodeproj, qui n'est pas versionné
open Vitrine.xcodeproj
```

Puis, dans Xcode : sélectionner la cible **Vitrine**, onglet *Signing &
Capabilities*, choisir l'équipe du compte développeur Apple. On peut aussi
renseigner `DEVELOPMENT_TEAM` dans `project.yml` et régénérer.

`⌘R` lance l'application dans le simulateur.

> Le `.xcodeproj` est un artefact : il est dans le `.gitignore`. Le projet se
> décrit dans `project.yml`, qui se relit et se fusionne, là où un
> `project.pbxproj` produit des conflits illisibles.

**Sans XcodeGen** : créer un projet App iOS vide dans Xcode, glisser les dossiers
`Vitrine/`, `Shared/` et `VitrineWidget/`, ajouter une cible *Widget Extension*,
et rattacher `Shared/` aux deux cibles.

## Publier

1. **Compte développeur Apple** (99 $ US par an). Programme *Organization* si la
   publication se fait au nom de l'Université Laval ou du CAPP, ce qui demande
   un numéro D-U-N-S et prend souvent plusieurs semaines. Programme *Individual*
   si c'est à titre personnel : accepté en un ou deux jours.
2. `Product > Archive`, puis *Distribute App*.
3. TestFlight d'abord, App Store ensuite.

### Le risque de refus, et pourquoi la tuile existe

La règle **4.2 « Minimum Functionality »** d'Apple fait rejeter les applications
qui se contentent d'afficher un site web. C'est le risque principal de ce
projet, et il est réel.

Les défenses en place : la tuile d'écran d'accueil (impossible en PWA sur iOS),
la lecture hors ligne, la détection de nouvelle édition qui survit à la mise en
arrière-plan, et l'ouverture native des liens sortants. Aucune ne garantit rien.

Si le refus tombe, la réponse la plus solide serait des **notifications** à
chaque nouvelle édition : c'est le service que le web ne rend pas sur iOS, et il
justifie à lui seul une application. Ce n'est pas fait ici, parce que ça demande
APNs et un émetteur côté serveur (un Worker Cloudflare branché sur le cycle de
publication) — un chantier à part entière.

**Pour un usage interne ou TestFlight, la règle 4.2 ne s'applique pas** et la
tuile devient un simple agrément.

## Réglages

| Où | Quoi |
|---|---|
| `Shared/Vitrine.swift` | Adresses du site. |
| `project.yml` | Identifiants de paquet (`science.ellipse.vitrine`), version, équipe. |
| `Shared/Enjeux.swift` | **Miroir de `lib/enjeux.ts`.** Les libellés et couleurs des douze enjeux sont recopiés. Toute modification là-bas doit être répercutée ici. |
| `generer-icone.py` | Refabrique l'icône depuis le logo du site. |

L'application vise **la production uniquement**. `dev.vitrinedemocratique.com`
est derrière Cloudflare Access, et l'authentification dans un `WKWebView` est un
terrier à lapin qui n'apporte rien ici.

## Ce qui n'a pas été vérifié

Écrit sous Linux. En toute honnêteté, et selon la règle « prouver, pas
décrire » du projet :

- **Jamais compilé.** Pas de `swiftc`, pas de `xcodebuild`. Les erreurs de
  syntaxe ou de typage n'ont pas pu être écartées.
- **Jamais exécuté.** Ni simulateur, ni appareil. Rien de ce qui est décrit
  plus haut n'a été observé.
- **`xcodegen generate` n'a jamais tourné** sur ce `project.yml`.
- **Aucun envoi à App Store Connect**, donc aucune validation des exigences de
  l'icône, des visuels ou des métadonnées.
- **L'icône est un agrandissement** de 512 vers 1024 px : les traits fins du
  monogramme sont interpolés. Exporter un 1024 natif avant toute publication.
- **La règle 4.2 est une appréciation, pas un fait** : personne n'a soumis cette
  application à un examen.

Ce qui a été vérifié, en revanche : les deux adresses lues renvoient bien un 200
avec la charge attendue (`hero-selection.json`, 329 octets ; `build-id.json`),
et les clés d'enjeux de `Shared/Enjeux.swift` sont recopiées de `lib/enjeux.ts`,
irrégularités comprises (`health_and_social_services`,
`international_affairs_and_defense`).

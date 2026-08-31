# Publier l'application Android sur le Play Store

> ## 🛑 PLAN ABANDONNÉ le 2026-08-31
>
> **La publication sur le Play Store a été écartée. Rien de ce qui suit n'est
> en cours.** Aucun compte n'a été créé, aucun frais engagé, aucune personne
> sollicitée pour tester.
>
> Pourquoi : un compte de développeur **personnel** ne peut demander l'accès à
> la production qu'après un test fermé réunissant **12 personnes pendant 14
> jours d'affilée**, sur des appareils Android réels. Le compte
> d'organisation, qui en dispense, exige une autorité de signature de
> l'Université Laval que le processus institutionnel ne permet pas d'obtenir
> dans un délai utile.
>
> **Le code reste en place et fonctionne** : `android.yml` le compile, ses 11
> tests unitaires s'exécutent, et un paquet `.aab` valide en sort. Il ne coûte
> rien à conserver et n'attend qu'une décision.
>
> Ce qui le relancerait, sans rien réécrire :
> - un compte d'organisation de l'Université Laval, qui supprime la règle des
>   14 jours ;
> - ou une douzaine de personnes disposant d'un téléphone Android.
>
> L'application iOS n'est pas concernée : elle est soumise et suit son cours.

---

De zéro jusqu'à l'application disponible publiquement. Tout se fait dans un
navigateur et sur un téléphone : aucun Android Studio requis, la compilation
vit dans `.github/workflows/android.yml`.

> **La tuile n'a aucune démarche propre.** Elle voyage dans le même paquet que
> l'application. Rien à déclarer, rien à soumettre séparément.

---

## ⏱ Ce qu'il faut savoir avant de commencer

### Le délai est de 14 jours au minimum, et il n'y a pas de raccourci

Un compte **personnel** créé après le 13 novembre 2023 doit mener un **test
fermé auprès d'au moins 12 personnes, restées inscrites 14 jours d'affilée**,
avant même de pouvoir DEMANDER l'accès à la production. Google vérifie que ces
personnes ont réellement ouvert l'application : ni émulateurs, ni comptes
doublons. Chaque nouvelle application recommence ce compte à zéro.

Ce n'est pas la validation d'Apple, qui prend 24 à 48 h. C'est un plancher de
deux semaines, plus le recrutement de douze personnes.

**Un compte d'organisation en est exempté.** C'est la même conversation que
pour le nom de développeur sur l'App Store, avec cette fois deux semaines de
délai à la clé plutôt qu'une question cosmétique. Si l'Université Laval peut
ouvrir le compte, l'application peut aller en production directement.

### Le niveau d'API est un plancher, pas une préférence

Depuis le **31 août 2026**, une nouvelle application doit viser Android 16
(API 36). C'est déjà le cas ici (`compileSdk`/`targetSdk = 36`), et
`tests/applications.test.ts` empêche de redescendre.

### Ce qui est déjà réglé

- **Politique de confidentialité** : `https://vitrinedemocratique.com/confidentialite/`,
  en ligne depuis le 31 août 2026. Le Play Store l'exige comme Apple.
- **Permissions** : `INTERNET` et `ACCESS_NETWORK_STATE`, rien d'autre. Le
  formulaire « Sécurité des données » en sera d'autant plus court.

---

## A — Le compte (~30 min, 25 $ US une fois)

1. [ ] Créer un compte sur [play.google.com/console](https://play.google.com/console).
       **25 $ US, une seule fois** (là où Apple demande 99 $ par an).
2. [ ] Choisir le type de compte. **Relire la section sur les 14 jours avant de
       cliquer** : « personnel » impose le test fermé, « organisation » en
       dispense mais demande une entité légale et sa vérification.
3. [ ] Vérifier son identité. Google demande une pièce d'identité et peut
       prendre 48 h.

## B — Le trousseau de signature (~5 min, à faire UNE fois)

Ce trousseau est l'identité de l'application. **Le perdre, c'est perdre la
capacité de publier des mises à jour.**

```sh
keytool -genkeypair -v \
  -keystore vitrine-upload.jks \
  -alias vitrine \
  -keyalg RSA -keysize 4096 -validity 10000 \
  -dname "CN=Vitrine democratique, OU=CAPP, O=Universite Laval, L=Quebec, ST=QC, C=CA"
```

- [ ] Choisir un mot de passe et le conserver dans un gestionnaire
- [ ] Sauvegarder `vitrine-upload.jks` **hors du dépôt**, dans deux endroits

> ⚠️ Ne jamais verser ce fichier dans le dépôt. `android/.gitignore` bloque
> `*.jks` et `*.keystore`, et un test vérifie qu'aucun n'est versionné.
>
> Filet de sécurité : avec la signature d'applications Play, Google conserve la
> clé finale et permet de **réinitialiser la clé de téléversement** en cas de
> perte. Ce n'est pas une raison de la perdre, mais ce n'est pas fatal.

Puis, pour que l'intégration continue puisse signer :

```sh
base64 -w0 vitrine-upload.jks
```

- [ ] Déposer dans *Settings → Secrets and variables → Actions* :
      `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`,
      `ANDROID_KEY_ALIAS` (`vitrine`), `ANDROID_KEY_PASSWORD`

## C — Le premier paquet

Le workflow `android` produit déjà un `.aab` **non signé** à chaque PR, publié
en artefact. Pour le premier téléversement, le plus simple est de le signer
localement ou de laisser Google le faire :

- [ ] Onglet **Actions** → dernier passage du workflow `android` → artefact
      `vitrine-android` → télécharger `app-release.aab`

> Ce premier envoi se fait à la main, exprès. La chaîne de publication
> automatique viendra quand le compte existera et que le test fermé sera
> configuré : brancher un téléversement automatique sur un magasin qui n'a
> encore ni fiche ni piste de test est le meilleur moyen de déboguer à l'aveugle.

## D — La fiche du magasin

Play Console → **Créer une application**.

- [ ] Nom : `La Vitrine démocratique` (30 caractères max)
- [ ] Langue par défaut : **français (Canada)**
- [ ] Application, et **gratuite** (ce choix est irréversible)
- [ ] **Description courte** (80 car.) : p. ex. « L'actualité politique québécoise, mesurée en continu »
- [ ] **Description longue** (4000 car.) : ce que fait la Vitrine, en langage
      grand public. Les règles de `.claude/skills/redaction-editoriale`
      s'appliquent. Mentionner la tuile d'écran d'accueil
- [ ] **Icône** : `android/play-icone-512.png`, produite par
      `python3 android/generer-icones.py`
- [ ] **Image de bannière** : 1024 × 500, à réaliser
- [ ] **Captures d'écran** : au moins 2, entre 320 et 3840 px de côté. Bien plus
      permissif qu'Apple, qui impose le pixel près
- [ ] **Catégorie** : Actualités et magazines
- [ ] **Confidentialité** : `https://vitrinedemocratique.com/confidentialite/`

## E — Les questionnaires

- [ ] **Sécurité des données**. Il porte sur tout ce qui se passe dans
      l'application, **y compris la vue web**. Le code Kotlin ne collecte rien,
      mais la page charge Cloudflare Web Analytics : répondre en regardant ce
      que fait réellement le site
- [ ] **Classification du contenu**. Actualité non filtrée
- [ ] **Public cible** : adultes
- [ ] **Application gouvernementale ?** Non. La Vitrine est un projet de
      recherche universitaire, pas un service public officiel. Le dire
      clairement évite une demande de justification

## F — Le test fermé, puis la production

- [ ] **Test fermé** → créer une piste, y verser le `.aab`
- [ ] Recruter **12 personnes** (collègues du CAPP, de la CLESSN, proches) et
      les inscrire par courriel
- [ ] Leur demander d'**installer et d'ouvrir réellement** l'application :
      Google mesure l'usage, pas l'inscription
- [ ] Attendre **14 jours d'affilée** sans que personne ne se désinscrive
- [ ] Puis : **Demander l'accès à la production**, et publier

---

## Vérifier sur l'appareil

Le code compile et ses tests unitaires passent, ce qui ne dit rien de son
comportement. **Personne n'a encore ouvert cette application.**

1. [ ] Le site s'affiche plein cadre, sans barre de navigateur
2. [ ] ⭐ **Toucher un lien sortant** (Polimètre, ou une Une renvoyant vers un
       média) : un onglet Chrome doit s'ouvrir par-dessus. Sur Android, ces
       liens ont **deux** chemins d'ouverture et il faut vérifier les deux
3. [ ] **Le bouton retour** revient dans l'historique du site, et ne quitte
       l'application qu'à la première page
4. [ ] Tirer vers le bas recharge
5. [ ] Mode avion puis relancer : l'écran « Hors ligne » natif, et « Réessayer »
6. [ ] Ajouter la tuile à l'écran d'accueil : elle affiche le titre de la Une du
       moment. Comparer avec vitrinedemocratique.com
7. [ ] Mettre en arrière-plan, revenir après une nouvelle parution : la page se
       recharge d'elle-même

---

## Différences avec l'App Store, en un coup d'œil

| | Play Store | App Store |
|---|---|---|
| Frais | 25 $ US une fois | 99 $ US par an |
| Délai avant production | **14 jours + 12 testeurs** (compte personnel) | 24 à 48 h d'examen |
| Coquille de site web | toléré | règle 4.2, refus fréquent |
| Captures d'écran | 320 à 3840 px, souple | dimensions exactes exigées |
| Nom du développeur | modifiable | **figé pour toujours** |

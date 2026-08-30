# Publier l'application sur l'App Store, sans posséder de Mac

De zéro jusqu'à l'application et sa tuile disponibles publiquement. Tout se fait
dans un navigateur et sur un iPhone : aucun Xcode, aucun Mac.

Le parcours a **quatre parties**, à faire dans l'ordre :

| | | Durée |
|---|---|---|
| **A** | [Ce qui bloque encore](#a--ce-qui-bloque-encore) | à régler avant tout |
| **B** | [Réglages, une seule fois](#b--réglages-une-seule-fois) | ~45 min |
| **C** | [Première version sur votre iPhone](#c--première-version-sur-votre-iphone-testflight) | ~1 h dont l'attente |
| **D** | [Soumettre à l'App Store](#d--soumettre-à-lapp-store) | ~2 h + 24-48 h d'examen |

> **La tuile n'a aucune démarche propre.** Elle voyage à l'intérieur du paquet de
> l'application. Rien à enregistrer, rien à soumettre séparément : elle sera là
> quand l'application y sera.

---

## A — Ce qui bloque encore

Trois points à trancher avant de commencer. Aucun n'est technique.

### A.1 Il n'existe pas de politique de confidentialité 🔴

**C'est le seul blocage dur.** Apple exige une adresse web pointant vers une
politique de confidentialité pour toute application publiée. Vérification faite
le 2026-08-30 : il n'y en a nulle part sur `vitrinedemocratique.com` — ni dans
`public/`, ni dans les routes de `app/`, ni dans la page « À propos ».

Il faut donc en publier une avant de soumettre. Le contenu est court, parce que
la réalité est simple : l'application ne collecte rien par elle-même, et le site
charge Cloudflare Web Analytics, une mesure d'audience sans témoin ni profil
individuel. C'est un texte public engageant le CAPP : à faire relire par Adrien
et, au besoin, par l'Université Laval.

*TestFlight n'en a pas besoin.* Les parties B et C peuvent commencer tout de suite.

### A.2 Personne n'a jamais exécuté cette application 🟠

Le code compile (vérifié à chaque PR par le workflow `ios.yml`), ce qui ne dit
rien de son comportement. La partie C existe pour ça, et **elle n'est pas
facultative** : soumettre à l'App Store une application que personne n'a ouverte
est le meilleur moyen de récolter un refus sur un défaut qu'une minute d'usage
aurait montré.

### A.3 Le nom du développeur se fige, définitivement 🟠

À l'étape B.3, Apple fige le nom affiché sous le titre de l'application. Le
compte étant **individuel**, ce sera **Laurence-Olivier M. Foisy**. Ce nom ne se
modifie **jamais** ensuite ; seul un transfert complet vers un compte
d'organisation le change.

Pour TestFlight, aucune importance : rien n'est public. Pour une diffusion
publique, c'est le moment de décider si la Vitrine doit paraître sous un nom
personnel ou sous celui de l'Université Laval. Un transfert reste possible plus
tard, mais il est bien plus simple tant qu'aucune fiche publique n'existe.

---

## B — Réglages, une seule fois

### B.1 Fusionner la PR #614 dans `main`

GitHub ne rend un workflow `workflow_dispatch` déclenchable **que s'il existe sur
la branche par défaut**. Tant que `ios-testflight.yml` ne vit que sur la branche
de la PR, il n'apparaît pas dans l'onglet Actions.

- [ ] Fusionner [la PR #614](https://github.com/ellipse-science/vitrine-showcase.github.io/pull/614) dans `main`

Fusionner dans `main` ne met rien en production : `prod` n'avance que par une
promotion délibérée, et l'application n'a de toute façon aucun effet sur le site.

### B.2 Enregistrer les deux identifiants

[developer.apple.com](https://developer.apple.com/account) →
*Certificates, Identifiers & Profiles* → **Identifiers** → **+** → *App IDs* → *App*

- [ ] `science.ellipse.vitrine` — description : « Vitrine democratique »
- [ ] `science.ellipse.vitrine.widget` — description : « Vitrine tuile »

Il en faut **deux**. Oublier celui de la tuile fait échouer l'archivage, avec un
message qui ne désigne pas la cause. Aucune capacité à cocher.

> **Ne PAS créer de certificat.** La section *Certificates* se laisse vide. Le
> workflow passe `-allowProvisioningUpdates` avec la clé d'API : Xcode fabrique
> lui-même le certificat et les profils sur le coureur. En créer un à la main
> réclamerait une demande de signature (CSR) produite par Trousseau d'accès,
> donc un Mac — exactement ce qu'on évite. **Seule la section *Identifiers* nous
> concerne.**

### B.3 Créer la fiche de l'application

[appstoreconnect.apple.com](https://appstoreconnect.apple.com) → **Apps** → **+** → *New App*

- [ ] Plateforme : **iOS**
- [ ] Nom : `La Vitrine démocratique` (23 caractères ; la limite est 30, et le nom
      doit être unique sur tout l'App Store. Si refusé : `Vitrine démocratique`)
- [ ] Langue principale : **French (Canada)**
- [ ] Identifiant : `science.ellipse.vitrine`
- [ ] SKU : `vitrine-democratique` (référence interne, sans importance)
- [ ] Accès : *Full Access*

⚠️ C'est ici que le nom du développeur se fige. Relire A.3.

### B.4 Fabriquer une clé d'API

App Store Connect → **Users and Access** → onglet **Integrations** →
*App Store Connect API* → **Team Keys** → **+**

- [ ] Nom : `GitHub Actions`
- [ ] Rôle : **App Manager** (moins ne suffit pas pour téléverser)
- [ ] Générer, puis **télécharger le fichier `.p8`**

> 🔴 Le `.p8` ne se télécharge **qu'une seule fois**. Perdu, il faut refaire une
> clé. Le mettre à l'abri tout de suite.

Noter sur la même page :

- [ ] **Key ID** — 10 caractères, sur la ligne de la clé
- [ ] **Issuer ID** — un UUID, en haut de la section

### B.5 Relever l'identifiant d'équipe

[developer.apple.com/account](https://developer.apple.com/account) →
**Membership details** → **Team ID**, 10 caractères. Il s'affiche aussi sous
votre nom, en haut à droite de la page *Certificates, Identifiers & Profiles*.

### B.6 Déposer les quatre secrets

Dépôt GitHub → **Settings** → *Secrets and variables* → **Actions** →
*New repository secret*. Les noms doivent être **exacts**.

| Nom | Contenu |
|---|---|
| `ASC_KEY_ID` | le Key ID (B.4) |
| `ASC_ISSUER_ID` | l'Issuer ID (B.4) |
| `ASC_PRIVATE_KEY` | le **contenu entier** du `.p8`, lignes `-----BEGIN/END PRIVATE KEY-----` comprises |
| `APPLE_TEAM_ID` | le Team ID (B.5) |

Pour la clé privée : ouvrir le `.p8` dans un éditeur de texte, tout sélectionner,
tout coller. Ne pas retirer les sauts de ligne.

---

## C — Première version sur votre iPhone (TestFlight)

### C.1 Lancer l'envoi

Dépôt GitHub → onglet **Actions** → workflow **ios-testflight** →
**Run workflow** → branche `main` → **Run workflow**. Compter 10 à 20 min.

La première étape vérifie les quatre secrets et s'arrête net avec un message
clair s'il en manque un, plutôt que d'échouer au milieu d'une archive.

> Ce workflow **n'a jamais tourné de bout en bout** : il ne pouvait pas, faute de
> secrets. La signature est la partie la plus capricieuse de l'intégration
> continue iOS. Prévoir un ou deux essais. Le tableau de la
> [section Dépannage](#dépannage) couvre les erreurs les plus probables.

### C.2 Installer

Apple doit d'abord *traiter* la version : 5 à 30 min de plus.

- [ ] App Store Connect → l'application → onglet **TestFlight** : la version
      passe de *Processing* à *Ready to Test*
- [ ] **Internal Testing** → créer un groupe, s'y ajouter
      (les testeurs internes évitent l'examen bêta d'Apple ; les externes non)
- [ ] Sur l'iPhone : installer **TestFlight** depuis l'App Store, ouvrir
      l'invitation reçue par courriel, installer

### C.3 Vérifier pour de vrai

C'est le cœur de l'affaire. **Personne n'a jamais exécuté cette application.**

1. [ ] Le site s'affiche plein cadre, sans barre de navigateur
2. [ ] ⭐ **Toucher un lien sortant** (Polimètre, ou une Une qui renvoie vers un
       média) : une feuille Safari doit s'ouvrir par-dessus.
       **Le point le plus important.** En cas de bogue, ces liens ne font rien
       du tout, sans message d'erreur.
3. [ ] Tirer vers le bas recharge la page
4. [ ] Mode avion puis relancer : l'écran « Hors ligne » natif apparaît, et
       « Réessayer » fonctionne une fois le réseau revenu
5. [ ] Ajouter la tuile à l'écran d'accueil (appui long sur le fond d'écran →
       **+** → chercher « Vitrine ») : elle affiche le titre de la Une du moment.
       Comparer avec vitrinedemocratique.com, ce doit être le même.
6. [ ] Mettre en arrière-plan, revenir après une nouvelle parution : la page se
       recharge d'elle-même

Ouvrir une issue par problème. **Ne pas passer à la partie D tant que le point 2
n'est pas vérifié.**

---

## D — Soumettre à l'App Store

Prérequis : A.1 réglé (politique de confidentialité en ligne) et C.3 concluant.

### D.1 Préparer les captures d'écran

Apple ne demande plus qu'**une** famille de tailles pour l'iPhone : la classe
**6,9 pouces**. Les listes des appareils plus petits en sont dérivées
automatiquement. L'application ne visant que l'iPhone, **aucune capture d'iPad
n'est requise**.

Dimensions acceptées : **1320×2868**, 1290×2796 ou 1260×2736. App Store Connect
**refuse le téléversement** si une image tombe à côté, au pixel près.

- [ ] Prendre 3 à 5 captures depuis l'application installée (bouton latéral +
      volume haut). Suggestion : la Une, le treemap des enjeux, l'Assemblée,
      la tuile sur l'écran d'accueil
- [ ] Les transférer sur l'ordinateur
- [ ] Les mettre aux bonnes dimensions :

```sh
python3 ios/preparer-captures.py ~/captures/*.png
```

Le script écrit dans `ios/captures-appstore/`, en 1320×2868 exactement. Un iPhone
ordinaire ne produit pas ces dimensions : seuls les Pro Max et l'Air le font.

- [ ] Téléverser dans App Store Connect → l'application → *Aperçus et captures d'écran*

⚠️ Les captures doivent montrer l'**application réelle**. Pas de maquette, pas de
photo d'une page web dans Safari.

### D.2 Remplir la fiche

App Store Connect → l'application → onglet **Distribution**.

- [ ] **Sous-titre** (30 car. max) — p. ex. « L'actualité politique, mesurée »
- [ ] **Description** — ce que fait la Vitrine, en langage grand public.
      Les règles de `.claude/skills/redaction-editoriale` s'appliquent :
      pas de tiret cadratin, pas de superlatif non calibré, « médias canadiens »
      et jamais « ROC ». Mentionner la tuile d'écran d'accueil
- [ ] **Mots-clés** (100 car., séparés par des virgules, sans espaces) —
      p. ex. `politique,Québec,médias,actualité,démocratie,élections,science`
- [ ] **Catégorie principale** : *News*. Secondaire : *Reference*
- [ ] **URL de soutien** — `https://vitrinedemocratique.com/apropos/`
- [ ] **URL marketing** (facultative) — `https://vitrinedemocratique.com`
- [ ] **Droits d'auteur** — `2026 CAPP, Université Laval`

### D.3 Confidentialité et classement

- [ ] **Politique de confidentialité (URL)** — celle publiée en A.1. Obligatoire
- [ ] **App Privacy** → questionnaire des données collectées.
      ⚠️ Il porte sur **tout ce qui se passe dans l'application, y compris la vue
      web**. Le code Swift ne collecte rien, mais la page charge **Cloudflare Web
      Analytics**. Répondre en regardant ce que fait réellement le site, pas en
      supposant que « l'application ne collecte rien »
- [ ] **Classement par âge** → questionnaire. L'application affiche de
      l'actualité politique sans la filtrer : la question sur les thèmes
      « matures ou suggestifs » se répond honnêtement, ce qui donne en général
      **12+** pour une application de nouvelles
- [ ] **Conformité à l'exportation** — déjà réglée dans le code
      (`ITSAppUsesNonExemptEncryption = false`), aucune question ne devrait
      apparaître

### D.4 Notes pour l'examen

Champ *App Review Information*. C'est ici qu'on désamorce la règle **4.2
« Minimum Functionality »**, qui fait refuser les applications se contentant
d'afficher un site web. C'est le risque principal de cette soumission.

- [ ] Aucun compte de démonstration nécessaire : tout est public. Le dire
- [ ] Coordonnées : nom, courriel, téléphone
- [ ] Expliquer ce que l'application apporte au-delà du site, en anglais et
      en termes concrets. Par exemple :

> This app is published by the Center for Public Policy Analysis (CAPP) at
> Université Laval, a public research group. Beyond displaying our site, it
> provides: a native home screen widget showing the current lead story
> (WidgetKit, not available to web apps on iOS); offline reading of the last
> loaded edition; native handling of outbound links via SFSafariViewController;
> and background detection of new editions, which are published every four hours.

### D.5 Envoyer

- [ ] Rattacher la version téléversée en partie C (section *Build*)
- [ ] **Add for Review** → **Submit to App Review**
- [ ] Diffusion : *Automatically release* ou *Manually release*. **Manuelle**
      est plus sage pour une première : l'application n'apparaît qu'à votre
      signal, une fois l'approbation reçue

L'examen prend en général 24 à 48 h. Un refus n'est pas une fin : Apple explique
son motif dans *Resolution Center*, on corrige et on renvoie. Un refus 4.2 se
conteste, arguments à l'appui — la partie D.4 est votre argumentaire.

---

## Publier une mise à jour, ensuite

1. Fusionner les changements dans `main`
2. Lancer **ios-testflight** (le numéro de build s'incrémente tout seul)
3. App Store Connect → **+ Version** → numéro (p. ex. `1.0.1`), nouveautés
4. Rattacher la version, soumettre

Le numéro de version se règle dans `MARKETING_VERSION`, `ios/project.yml`.

---

## Dépannage

| Message | Cause probable |
|---|---|
| `No profiles for 'science.ellipse.vitrine' were found` | Identifiant non enregistré (B.2), ou `APPLE_TEAM_ID` erroné |
| Échec sur le paquet de la tuile | L'identifiant `…​.widget` a été oublié en B.2 |
| `The bundle version must be higher than…` | Relancer : le numéro suit `run_number` et augmente seul |
| `Authentication failed` / clé refusée | `ASC_PRIVATE_KEY` tronquée, ou rôle inférieur à *App Manager* |
| Capture refusée au téléversement | Dimensions hors de la liste. Repasser par `preparer-captures.py` |
| Refus 4.2 « Minimum Functionality » | Étoffer D.4. En dernier recours, des notifications à chaque parution sont l'argument le plus solide (chantier à part : APNs + un émetteur côté serveur) |

Le journal complet est dans l'onglet Actions. Les étapes se terminent par
`tail`, donc la fin du journal contient l'erreur.

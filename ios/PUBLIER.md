# Mettre l'application sur un iPhone, sans posséder de Mac

Marche à suivre complète, de zéro à l'application installée. Tout se fait dans
un navigateur : aucun Xcode, aucun Mac.

Compter environ 45 min la première fois, dont une bonne part d'attente.

> **Vocabulaire.** *TestFlight* = la distribution de test d'Apple, séparée de
> l'App Store public. C'est là qu'on va. Rien de ce qui suit ne rend
> l'application visible au public.

---

## Avant de commencer

- [ ] Un compte Apple Developer actif (99 $ US par an, payé)
- [ ] Un iPhone
- [ ] Les droits d'administration sur le dépôt GitHub

⚠️ **Un point sans retour dans la suite.** L'étape 3 fige le **nom du
développeur** affiché sur l'App Store. Sur un compte **individuel**, ce sera le
nom légal du titulaire, et il ne se modifie **jamais** ensuite. Pour un usage
TestFlight seulement, c'est sans conséquence : rien n'est public, et un
transfert vers un compte d'organisation reste simple tant qu'aucune fiche
publique n'existe. Mais **ne pas soumettre à l'examen public** avant d'avoir
tranché la question du compte de l'Université Laval.

---

## 1. Fusionner la PR #614 dans `main`

Sans cette étape, rien ne fonctionne : GitHub ne rend un workflow
`workflow_dispatch` déclenchable **que s'il existe sur la branche par défaut**.
Tant que `ios-testflight.yml` ne vit que sur la branche de la PR, il n'apparaît
même pas dans l'onglet Actions.

- [ ] Fusionner [la PR #614](https://github.com/ellipse-science/vitrine-showcase.github.io/pull/614) dans `main`

Fusionner dans `main` ne met rien en production : `prod` n'avance que par une
promotion délibérée. Et l'application n'a de toute façon aucun effet sur le site.

## 2. Enregistrer les deux identifiants

Sur [developer.apple.com](https://developer.apple.com/account) →
*Certificates, Identifiers & Profiles* → **Identifiers** → **+** → *App IDs* → *App*

Il en faut **deux**. Oublier le second fait échouer l'archivage, parce que la
tuile est un paquet distinct de l'application.

- [ ] `science.ellipse.vitrine` — description : « Vitrine democratique »
- [ ] `science.ellipse.vitrine.widget` — description : « Vitrine tuile »

Aucune capacité à cocher : l'application ne demande ni notifications, ni
groupes d'applications, ni rien d'autre.

> **Ne PAS créer de certificat.** La section *Certificates* de cette page se
> laisse vide. Le workflow passe `-allowProvisioningUpdates` avec la clé d'API :
> Xcode fabrique lui-même le certificat de distribution et les profils sur le
> coureur. En fabriquer un à la main réclamerait une demande de signature (CSR)
> produite par Trousseau d'accès, donc un Mac — exactement ce qu'on évite ici.
> Dans cette page, **seule la section *Identifiers* nous concerne**.

## 3. Créer la fiche de l'application

Sur [appstoreconnect.apple.com](https://appstoreconnect.apple.com) → **Apps** → **+** → *New App*

- [ ] Plateforme : **iOS**
- [ ] Nom : `La Vitrine démocratique` (doit être unique sur tout l'App Store ; si
      refusé, essayer `Vitrine démocratique`)
- [ ] Langue principale : **French (Canada)**
- [ ] Identifiant : `science.ellipse.vitrine`
- [ ] SKU : `vitrine-democratique` (référence interne, sans importance)
- [ ] Accès : *Full Access*

⚠️ C'est ici que le nom du développeur se fige. Relire l'avertissement plus haut.

## 4. Fabriquer une clé d'API

Sur App Store Connect → **Users and Access** → onglet **Integrations** →
*App Store Connect API* → **Team Keys** → **+**

- [ ] Nom : `GitHub Actions`
- [ ] Rôle : **App Manager** (moins ne suffit pas pour téléverser)
- [ ] Générer, puis **télécharger le fichier `.p8`**

> 🔴 Le `.p8` ne se télécharge **qu'une seule fois**. Perdu, il faut refaire une
> clé. Le mettre à l'abri tout de suite.

Noter au passage, sur la même page :

- [ ] **Key ID** — 10 caractères, dans la ligne de la clé
- [ ] **Issuer ID** — un UUID, affiché en haut de la section

## 5. Relever l'identifiant d'équipe

Sur [developer.apple.com/account](https://developer.apple.com/account) →
**Membership details**

- [ ] **Team ID** — 10 caractères

## 6. Déposer les quatre secrets

Dépôt GitHub → **Settings** → *Secrets and variables* → **Actions** →
*New repository secret*. Les noms doivent être **exacts**.

| Nom | Contenu |
|---|---|
| `ASC_KEY_ID` | le Key ID de l'étape 4 |
| `ASC_ISSUER_ID` | l'Issuer ID de l'étape 4 |
| `ASC_PRIVATE_KEY` | le **contenu entier** du fichier `.p8`, lignes `-----BEGIN PRIVATE KEY-----` et `-----END PRIVATE KEY-----` comprises |
| `APPLE_TEAM_ID` | le Team ID de l'étape 5 |

Pour `ASC_PRIVATE_KEY` : ouvrir le `.p8` dans un éditeur de texte, tout
sélectionner, tout coller. Ne pas retirer les sauts de ligne.

- [ ] Les quatre secrets sont déposés

## 7. Lancer l'envoi

Dépôt GitHub → onglet **Actions** → workflow **ios-testflight** →
**Run workflow** → branche `main` → **Run workflow**

- [ ] Le workflow est lancé

Il archive, signe et téléverse. Compter 10 à 20 min. La toute première étape
vérifie les quatre secrets et s'arrête net avec un message clair s'il en manque
un, plutôt que d'échouer au milieu d'une archive.

## 8. Installer sur l'iPhone

Après le succès du workflow, la version doit être **traitée** par Apple
(« Processing »), ce qui prend encore 5 à 30 min.

- [ ] App Store Connect → l'application → onglet **TestFlight** : la version
      apparaît et passe de *Processing* à *Ready to Test*
- [ ] **Internal Testing** → ajouter un groupe, s'y ajouter soi-même
      (les testeurs internes évitent l'examen bêta d'Apple ; les externes non)
- [ ] Sur l'iPhone : installer **TestFlight** depuis l'App Store, ouvrir
      l'invitation reçue par courriel, installer

---

## Ce qu'il faut vraiment vérifier une fois installée

C'est le cœur de l'affaire : **personne n'a jamais exécuté cette
application**. Le code compile, ce qui ne dit rien de son comportement.

1. [ ] Le site s'affiche plein cadre, sans barre de navigateur
2. [ ] **Toucher un lien sortant** (Polimètre, ou une Une qui renvoie vers un
       média) : une feuille Safari doit s'ouvrir par-dessus.
       ⭐ **Le point le plus important.** En cas de bogue, ces liens ne font
       rien du tout, sans message d'erreur.
3. [ ] Tirer vers le bas recharge la page
4. [ ] Mode avion, puis relancer : l'écran « Hors ligne » natif apparaît, et
       « Réessayer » fonctionne une fois le réseau revenu
5. [ ] Ajouter la tuile à l'écran d'accueil : elle affiche le titre de la Une
       du moment. Comparer avec vitrinedemocratique.com, ce doit être le même.
6. [ ] Mettre en arrière-plan, revenir après une nouvelle parution : la page se
       recharge d'elle-même, sans bandeau

Noter ce qui cloche et ouvrir une issue par problème.

---

## Si ça échoue

Le workflow `ios-testflight.yml` **n'a jamais tourné de bout en bout** : il ne
pouvait pas, faute de secrets. Le premier envoi lui sert de test, et la
signature est la partie la plus capricieuse de l'intégration continue iOS.

| Message | Cause probable |
|---|---|
| `No profiles for 'science.ellipse.vitrine' were found` | Identifiant non enregistré (étape 2), ou `APPLE_TEAM_ID` erroné |
| Échec sur le paquet de la tuile | L'identifiant `…​.widget` a été oublié à l'étape 2 |
| `The bundle version must be higher than…` | Relancer : le numéro de build suit `run_number` et augmente seul |
| `Authentication failed` / clé refusée | `ASC_PRIVATE_KEY` tronquée, ou rôle inférieur à *App Manager* |

Le journal complet est dans l'onglet Actions. Les étapes utilisent `tail`, donc
la fin du journal contient l'erreur.

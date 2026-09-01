import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { ISSUE_COLORS, ISSUE_LABELS_SHORT } from "@/lib/enjeux";

// Les deux applications, iOS et Android, se ressemblent trait pour trait mais
// vivent dans des langages que cette chaîne ne compile pas (le Swift est
// compilé par `ios.yml` sur macOS ; le Kotlin l'est et TESTÉ par `android.yml`
// sur Ubuntu). Ce fichier verrouille ce qui se vérifie par LECTURE du source et
// casserait silencieusement si personne ne regardait :
//
//   1. aucune des deux applications ne pointe ailleurs que sur la production ;
//   2. les copies d'`Enjeux` restent fidèles à `lib/enjeux.ts` ;
//   3. les paquets et le niveau d'API restent conformes aux magasins.
//
// Ce sont exactement les endroits où une erreur ne se verrait ni à la
// compilation, ni à l'œil dans une revue de PR.

const RACINE = process.cwd();
const RACINE_IOS = join(RACINE, "ios");
const RACINE_ANDROID = join(RACINE, "android");

function fichiers(dossier: string, extension: string): string[] {
  const trouves: string[] = [];
  for (const nom of readdirSync(dossier)) {
    const chemin = join(dossier, nom);
    if (statSync(chemin).isDirectory()) {
      if (nom === "build" || nom === ".gradle") continue;
      trouves.push(...fichiers(chemin, extension));
    } else if (nom.endsWith(extension)) {
      trouves.push(chemin);
    }
  }
  return trouves;
}

/** Retire les commentaires, pour n'inspecter que du code.
 *
 *  Deux formes à traiter, et la seconde a failli passer inaperçue : le Swift du
 *  projet commente en `///`, que le filtre par ligne attrape, mais la KDoc du
 *  Kotlin s'écrit `/** … *\/` et ses lignes commencent par `*`. Sans le premier
 *  remplacement, le texte des commentaires serait lu comme du code, et une
 *  phrase citant `endsWith` ferait échouer un test qui vérifie le code.
 *
 *  Le retrait des blocs vient d'abord ; le filtre par ligne ne touche ensuite
 *  qu'aux `//`, ce qui ne peut pas couper un `https://…` en début de ligne. */
function sansCommentaires(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((ligne) => !ligne.trim().startsWith("//"))
    .join("\n");
}

const lire = (racine: string, extension: string) =>
  fichiers(racine, extension).map((chemin) => ({
    chemin: chemin.slice(racine.length + 1),
    code: sansCommentaires(readFileSync(chemin, "utf8")),
  }));

const SOURCES_IOS = lire(RACINE_IOS, ".swift");
// Seulement `src/main` : les tests Kotlin citent volontairement `api.`, `dev.`
// et des hôtes tiers comme cas à REJETER. Les inclure ici ferait échouer les
// vérifications ci-dessous sur les fixtures mêmes qui les prouvent.
const SOURCES_ANDROID = lire(RACINE_ANDROID, ".kt").filter((f) =>
  f.chemin.startsWith(join("app", "src", "main")),
);
const SOURCES = [...SOURCES_IOS, ...SOURCES_ANDROID];

describe("aucune des deux applications ne montre autre chose que la production", () => {
  it("trouve bien des sources à inspecter, des deux côtés", () => {
    // Garde-fou du garde-fou : si un renommage vidait ces listes, tous les
    // tests ci-dessous passeraient sans rien vérifier.
    expect(SOURCES_IOS.length, "aucune source Swift").toBeGreaterThanOrEqual(5);
    expect(SOURCES_ANDROID.length, "aucune source Kotlin").toBeGreaterThanOrEqual(4);
  });

  it("vise l'apex de production, et rien d'autre", () => {
    const swift = SOURCES_IOS.find((f) => f.chemin.endsWith("Vitrine.swift"));
    expect(swift, "ios/Shared/Vitrine.swift introuvable").toBeDefined();
    expect(swift!.code).toContain('URL(string: "https://vitrinedemocratique.com/")!');

    const kotlin = SOURCES_ANDROID.find((f) => f.chemin.endsWith("Vitrine.kt"));
    expect(kotlin, "android .../Vitrine.kt introuvable").toBeDefined();
    expect(kotlin!.code).toContain('const val SITE = "https://vitrinedemocratique.com/"');
  });

  it("ne mentionne jamais l'API ni l'environnement de travail", () => {
    // `api.` est fermée par clé et coûte de l'egress ; `dev.` est derrière
    // Cloudflare Access. Ni l'une ni l'autre n'a sa place dans un binaire
    // distribué à des téléphones.
    for (const { chemin, code } of SOURCES) {
      expect(code, `${chemin} mentionne api.vitrinedemocratique.com`).not.toContain(
        "api.vitrinedemocratique.com",
      );
      expect(code, `${chemin} mentionne dev.vitrinedemocratique.com`).not.toContain(
        "dev.vitrinedemocratique.com",
      );
    }
  });

  it("n'a aucune adresse http:// ni aucun autre hôte", () => {
    for (const { chemin, code } of SOURCES) {
      const adresses = code.match(/https?:\/\/[a-z0-9.-]+/gi) ?? [];
      for (const adresse of adresses) {
        expect(adresse, `${chemin} pointe vers ${adresse}`).toBe(
          "https://vitrinedemocratique.com",
        );
      }
    }
  });

  it("garde une liste d'hôtes internes explicite, des deux côtés", () => {
    // `hasSuffix`/`endsWith(".vitrinedemocratique.com")` classerait `api.` et
    // `dev.` comme internes et les laisserait s'ouvrir DANS la vue web. C'est
    // la régression que ce test empêche de revenir.
    const swift = SOURCES_IOS.find((f) => f.chemin.endsWith("Vitrine.swift"))!;
    expect(swift.code).not.toContain("hasSuffix");
    expect(swift.code).toContain('hote == "vitrinedemocratique.com"');
    expect(swift.code).toContain('hote == "www.vitrinedemocratique.com"');

    const kotlin = SOURCES_ANDROID.find((f) => f.chemin.endsWith("Vitrine.kt"))!;
    expect(kotlin.code).not.toContain("endsWith");
    expect(kotlin.code).toContain('hote == "vitrinedemocratique.com"');
    expect(kotlin.code).toContain('hote == "www.vitrinedemocratique.com"');
  });

  it("ne lit aucune adresse depuis l'environnement", () => {
    // Une adresse injectée au build rouvrirait la porte à un binaire qui
    // pointe ailleurs que la production.
    for (const { chemin, code } of SOURCES) {
      expect(code, `${chemin} lit une variable d'environnement`).not.toContain(
        "ProcessInfo.processInfo.environment",
      );
    }
  });
});

describe("les Info.plist portent les clés du gabarit d'Xcode", () => {
  // Un Info.plist écrit à la main ne reçoit PAS ces clés automatiquement, même
  // avec un INFOPLIST_FILE explicite. Sans CFBundleIdentifier, tout compile et
  // se signe correctement, puis l'archivage échoue sur « Archive Missing Bundle
  // Identifier » — dix minutes plus tard, et sans nommer la clé manquante.
  const REQUISES = [
    "CFBundleIdentifier",
    "CFBundleExecutable",
    "CFBundlePackageType",
    "CFBundleInfoDictionaryVersion",
    "CFBundleShortVersionString",
    "CFBundleVersion",
  ];

  const plists = [
    "Vitrine/Info.plist",
    "VitrineWidget/Info.plist",
  ].map((chemin) => ({
    chemin,
    xml: readFileSync(join(RACINE_IOS, chemin), "utf8"),
  }));

  it.each(plists)("$chemin déclare toutes les clés requises", ({ chemin, xml }) => {
    const manquantes = REQUISES.filter((cle) => !xml.includes(`<key>${cle}</key>`));
    expect(manquantes, `${chemin} : clés absentes`).toEqual([]);
  });

  it.each(plists)("$chemin dérive son identifiant du réglage de cible", ({ xml }) => {
    // En dur, l'identifiant de l'extension et celui de l'application
    // finiraient par diverger de `project.yml` sans que rien ne le signale.
    expect(xml).toContain("<string>$(PRODUCT_BUNDLE_IDENTIFIER)</string>");
  });

  it.each(plists)("$chemin nomme le paquet", ({ chemin, xml }) => {
    // App Store Connect refuse une extension sans CFBundleName, et le dit
    // seulement après le téléversement.
    expect(xml, `${chemin} sans CFBundleName`).toContain("<key>CFBundleName</key>");
  });

  it("l'application déclare les quatre orientations", () => {
    // Trois sur quatre suffisent à compiler, à signer et à archiver ; c'est la
    // validation du téléversement qui refuse, en exigeant « all of the
    // orientations to support iPad multitasking ».
    const app = plists.find((p) => p.chemin.startsWith("Vitrine/"))!.xml;
    for (const sens of [
      "UIInterfaceOrientationPortrait",
      "UIInterfaceOrientationPortraitUpsideDown",
      "UIInterfaceOrientationLandscapeLeft",
      "UIInterfaceOrientationLandscapeRight",
    ]) {
      expect(app, `orientation absente : ${sens}`).toContain(`<string>${sens}</string>`);
    }
  });
});

describe("les workflows iOS utilisent un SDK accepté par Apple", () => {
  // « All iOS and iPadOS apps must be built with the iOS 26 SDK or later. »
  // L'image du coureur porte le SDK : la choisir trop ancienne fait échouer
  // la validation APRÈS le téléversement.
  const workflows = ["ios.yml", "ios-testflight.yml"].map((nom) => ({
    nom,
    yml: readFileSync(join(RACINE_IOS, "..", ".github", "workflows", nom), "utf8"),
  }));

  it.each(workflows)("$nom tourne sur une image assez récente", ({ nom, yml }) => {
    const image = yml.match(/runs-on:\s*macos-(\d+)/);
    expect(image, `${nom} : aucune image macOS déclarée`).not.toBeNull();
    expect(Number(image![1]), `${nom} : image macOS trop ancienne`).toBeGreaterThanOrEqual(26);
  });
});

describe("l'application Android reste publiable sur le Play Store", () => {
  const gradle = readFileSync(
    join(RACINE_ANDROID, "app", "build.gradle.kts"),
    "utf8",
  );

  // Depuis le 31 août 2026, Google Play refuse toute NOUVELLE application qui
  // vise moins qu'Android 16. Ce n'est pas une échéance à venir : c'est un
  // refus immédiat au téléversement.
  const PLANCHER = 36;

  it.each(["compileSdk", "targetSdk"])("%s vise au moins Android 16", (cle) => {
    const trouve = gradle.match(new RegExp(`${cle}\\s*=\\s*(\\d+)`));
    expect(trouve, `${cle} absent de build.gradle.kts`).not.toBeNull();
    expect(Number(trouve![1]), `${cle} sous le plancher du Play Store`).toBeGreaterThanOrEqual(
      PLANCHER,
    );
  });

  it("ne verse aucun trousseau de signature dans le dépôt", () => {
    // Un trousseau commité, c'est l'identité de publication perdue pour de
    // bon dans un dépôt public.
    const trousseaux = fichiers(RACINE_ANDROID, ".jks").concat(
      fichiers(RACINE_ANDROID, ".keystore"),
    );
    expect(trousseaux, "trousseau versionné").toEqual([]);
    expect(gradle).toContain("System.getenv");
  });

  it("ne demande que les permissions nécessaires", () => {
    const manifeste = readFileSync(
      join(RACINE_ANDROID, "app", "src", "main", "AndroidManifest.xml"),
      "utf8",
    );
    const demandees = [...manifeste.matchAll(/android:name="android\.permission\.([A-Z_]+)"/g)]
      .map((m) => m[1])
      .sort();
    // Le formulaire « Sécurité des données » du Play Store se remplit à partir
    // de cette liste : la garder minimale est ce qui rend la déclaration
    // honnête et courte.
    expect(demandees).toEqual(["ACCESS_NETWORK_STATE", "INTERNET"]);
  });
});

describe("les copies d'Enjeux recopient fidèlement lib/enjeux.ts", () => {
  // ⚠️ Il existe désormais TROIS copies à la main des douze catégories :
  // `lib/enjeux.ts` (la source), `ios/Shared/Enjeux.swift` et
  // `android/.../Enjeux.kt`. Ce bloc est ce qui empêche la dérive silencieuse,
  // mais c'est aussi l'argument le plus solide pour, un jour, ENGENDRER les
  // deux copies depuis le TypeScript plutôt que de les maintenir.
  const enjeux = SOURCES.find((f) => f.chemin.endsWith("Enjeux.swift"));
  const enjeuxKt = SOURCES.find((f) => f.chemin.endsWith("Enjeux.kt"));

  /** Extrait une table Kotlin `mapOf("cle" to "valeur", …)` déclarée sous `nom`. */
  function tableKotlin(nom: string): Record<string, string> {
    expect(enjeuxKt, "Enjeux.kt est introuvable").toBeDefined();
    const debut = enjeuxKt!.code.indexOf(`val ${nom}`);
    expect(debut, `déclaration ${nom} introuvable`).toBeGreaterThan(-1);
    const ouverture = enjeuxKt!.code.indexOf("mapOf(", debut) + "mapOf(".length;
    const fin = enjeuxKt!.code.indexOf("\n    )", ouverture);
    expect(fin, `fin de la table ${nom} introuvable`).toBeGreaterThan(ouverture);
    const bloc = enjeuxKt!.code.slice(ouverture, fin);
    const paires: Record<string, string> = {};
    for (const [, cle, valeur] of bloc.matchAll(/"([^"]+)"\s+to\s+"([^"]*)"/g)) {
      paires[cle] = valeur;
    }
    return paires;
  }

  const sansDiese = Object.fromEntries(
    Object.entries(ISSUE_COLORS).map(([cle, valeur]) => [cle, valeur.replace("#", "")]),
  );

  it("Kotlin porte exactement les mêmes libellés", () => {
    expect(tableKotlin("libelles")).toEqual(ISSUE_LABELS_SHORT);
  });

  it("Kotlin porte exactement les mêmes couleurs", () => {
    expect(tableKotlin("couleurs")).toEqual(sansDiese);
  });

  it("les deux copies sont identiques entre elles", () => {
    // Comparer chaque copie à la source ne suffit pas à le dire à voix haute :
    // ce test-ci échouera si les deux applications se mettent à afficher des
    // libellés différents pour un même enjeu.
    expect(tableKotlin("libelles")).toEqual(dictionnaire("libelles"));
    expect(tableKotlin("couleurs")).toEqual(dictionnaire("couleurs"));
  });

  /** Extrait un dictionnaire Swift `["cle": "valeur", …]` déclaré sous `nom`. */
  function dictionnaire(nom: string): Record<string, string> {
    expect(enjeux, "Enjeux.swift est introuvable").toBeDefined();
    const debut = enjeux!.code.indexOf(`static let ${nom}`);
    expect(debut, `déclaration ${nom} introuvable`).toBeGreaterThan(-1);
    // On ouvre APRÈS le `= [` : le premier `]` rencontré depuis `debut` est
    // celui du type `[String: String]`, pas la fin du dictionnaire.
    const ouverture = enjeux!.code.indexOf("= [", debut) + "= [".length;
    const fin = enjeux!.code.indexOf("\n    ]", ouverture);
    expect(fin, `fin du dictionnaire ${nom} introuvable`).toBeGreaterThan(ouverture);
    const bloc = enjeux!.code.slice(ouverture, fin);
    const paires: Record<string, string> = {};
    for (const [, cle, valeur] of bloc.matchAll(/"([^"]+)"\s*:\s*"([^"]*)"/g)) {
      paires[cle] = valeur;
    }
    return paires;
  }

  it("porte exactement les mêmes libellés", () => {
    expect(dictionnaire("libelles")).toEqual(ISSUE_LABELS_SHORT);
  });

  it("porte exactement les mêmes couleurs", () => {
    // Côté TypeScript les couleurs s'écrivent « #234E78 », côté Swift
    // « 234E78 » : SwiftUI n'a pas d'initialiseur hexadécimal natif et
    // `Color(hex:)` scanne la valeur sans dièse.
    const attendu = Object.fromEntries(
      Object.entries(ISSUE_COLORS).map(([cle, valeur]) => [cle, valeur.replace("#", "")]),
    );
    expect(dictionnaire("couleurs")).toEqual(attendu);
  });

  it("couvre les douze catégories du CAP", () => {
    expect(Object.keys(dictionnaire("libelles"))).toHaveLength(12);
  });
});

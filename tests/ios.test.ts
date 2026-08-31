import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { ISSUE_COLORS, ISSUE_LABELS_SHORT } from "@/lib/enjeux";

// Le code Swift de `ios/` ne peut pas être testé ici : il n'y a pas de
// compilateur Swift dans cette chaîne (la compilation vit dans le workflow
// `ios.yml`, sur un coureur macOS). Ce fichier verrouille donc les deux
// propriétés qui se vérifient par LECTURE du source, et qui casseraient
// silencieusement si personne ne regardait :
//
//   1. l'application ne pointe QUE vers la production ;
//   2. `Shared/Enjeux.swift` est une recopie fidèle de `lib/enjeux.ts`.
//
// Ce sont exactement les deux endroits où une erreur ne se verrait ni à la
// compilation, ni à l'œil dans une revue de PR.

const RACINE_IOS = join(process.cwd(), "ios");

function fichiersSwift(dossier: string): string[] {
  const trouves: string[] = [];
  for (const nom of readdirSync(dossier)) {
    const chemin = join(dossier, nom);
    if (statSync(chemin).isDirectory()) {
      trouves.push(...fichiersSwift(chemin));
    } else if (nom.endsWith(".swift")) {
      trouves.push(chemin);
    }
  }
  return trouves;
}

/** Retire les lignes de commentaire. Tous les commentaires du projet sont
 *  posés sur leur propre ligne (`//` ou `///`), jamais en fin de ligne de
 *  code : on peut donc filtrer par ligne sans risquer de couper un
 *  `https://…` au passage. */
function sansCommentaires(source: string): string {
  return source
    .split("\n")
    .filter((ligne) => !ligne.trim().startsWith("//"))
    .join("\n");
}

const SOURCES = fichiersSwift(RACINE_IOS).map((chemin) => ({
  chemin: chemin.slice(RACINE_IOS.length + 1),
  code: sansCommentaires(readFileSync(chemin, "utf8")),
}));

describe("l'application iOS ne montre que la production", () => {
  it("trouve bien des sources Swift à inspecter", () => {
    // Garde-fou du garde-fou : si un renommage vidait cette liste, tous les
    // tests ci-dessous passeraient sans rien vérifier.
    expect(SOURCES.length).toBeGreaterThanOrEqual(5);
  });

  it("vise l'apex de production, et rien d'autre", () => {
    const vitrine = SOURCES.find((f) => f.chemin.endsWith("Vitrine.swift"));
    expect(vitrine).toBeDefined();
    expect(vitrine!.code).toContain('URL(string: "https://vitrinedemocratique.com/")!');
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

  it("garde une liste d'hôtes internes explicite, sans hasSuffix", () => {
    const vitrine = SOURCES.find((f) => f.chemin.endsWith("Vitrine.swift"))!;
    // `hasSuffix(".vitrinedemocratique.com")` classerait `api.` et `dev.`
    // comme internes et les laisserait s'ouvrir DANS la vue web. C'est la
    // régression que ce test empêche de revenir.
    expect(vitrine.code).not.toContain("hasSuffix");
    expect(vitrine.code).toContain('hote == "vitrinedemocratique.com"');
    expect(vitrine.code).toContain('hote == "www.vitrinedemocratique.com"');
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
});

describe("Shared/Enjeux.swift recopie fidèlement lib/enjeux.ts", () => {
  const enjeux = SOURCES.find((f) => f.chemin.endsWith("Enjeux.swift"));

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

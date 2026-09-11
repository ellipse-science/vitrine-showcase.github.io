// `avecDelai` borne l'attente de la publication de la sélection de la Une.
//
// CE QU'IL PROTÈGE. Le bloc qui publie la sélection tourne AVANT les Deploy
// Hooks. Une lecture R2 qui ÉCHOUE est déjà rattrapée par le try/catch de
// l'appelant ; une lecture qui TRAÎNE ne l'est pas — elle retarderait les
// hooks, donc l'édition, pour un artefact que personne ne lit encore. C'est le
// seul chemin par lequel cette fonctionnalité peut nuire au site
// (aws-refiners#490).

import { describe, it, expect } from "vitest";
import { avecDelai, DELAI_MS } from "@/workers/api/src/hero-selection-logic";

describe("avecDelai", () => {
  it("rend la valeur quand la promesse arrive à temps", async () => {
    await expect(avecDelai(Promise.resolve("ok"), 1000, "essai")).resolves.toBe("ok");
  });

  it("laisse remonter l'échec d'origine, sans le masquer par un délai", async () => {
    // Un échec de lecture R2 doit rester lisible dans le journal : le
    // remplacer par « délai dépassé » ferait chercher au mauvais endroit.
    await expect(
      avecDelai(Promise.reject(new Error("R2 indisponible")), 1000, "essai"),
    ).rejects.toThrow("R2 indisponible");
  });

  it("rejette quand la promesse traîne au-delà du délai", async () => {
    const jamais = new Promise<string>(() => {});
    await expect(avecDelai(jamais, 20, "sélection de la Une")).rejects.toThrow(
      /sélection de la Une : délai de 20 ms dépassé/,
    );
  });

  it("ne laisse pas de minuterie derrière lui quand la promesse gagne", async () => {
    // Une minuterie non nettoyée retiendrait le runtime éveillé après la
    // réponse — sur un Worker, c'est du temps facturé pour rien.
    const avant = vitestTimersActifs();
    await avecDelai(Promise.resolve(1), 10_000, "essai");
    expect(vitestTimersActifs()).toBe(avant);
  });

  it("le délai par défaut est franc et raisonnable", () => {
    // Assez large pour une lecture, un calcul sur ~770 événements et une
    // écriture ; négligeable devant les minutes qui séparent la synchro du
    // build. Si quelqu'un le pousse à la minute, ce test le dira.
    expect(DELAI_MS).toBeGreaterThanOrEqual(1_000);
    expect(DELAI_MS).toBeLessThanOrEqual(15_000);
  });
});

/** Nombre de minuteries encore armées — approximation suffisante pour détecter
 *  une fuite évidente sans dépendre des internes de Node. */
function vitestTimersActifs(): number {
  const handles = (
    process as unknown as { _getActiveHandles?: () => unknown[] }
  )._getActiveHandles;
  return typeof handles === "function" ? handles.call(process).length : 0;
}

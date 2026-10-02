"use client";

import { useEffect, useState } from "react";

import type { PeriodKey } from "@/lib/data/assemblee";

// TÉLÉCHARGER UNE CARTE EN HAUTE RÉSOLUTION (vitrine#920). Les PNG (2 142 ×
// 2 992, recto et verso) sont rendus par le générateur quand les données
// changent et servis depuis un dépôt public ; le navigateur les charge dans
// un canevas, ajoute sous chaque face une bande qui dit QUAND la carte a été
// téléchargée et DE QUAND datent ses données, puis les enregistre.
//
// L'ESTAMPILLE DATE, ELLE NE CERTIFIE PAS : du texte dans un PNG se retouche.
// Elle est là pour qu'une carte qui circule porte l'état des données qu'elle
// montre, pas pour en prouver l'origine.
//
// RÈGLE DU SITE : le navigateur n'appelle jamais l'API pour des données. Ici il
// appelle un dépôt d'images publiques (NEXT_PUBLIC_CARTES_BASE), l'exception
// bornée décrite dans workers/api/src/cartes.ts. Sans cette variable au build,
// le bouton n'existe pas.

const BASE = process.env.NEXT_PUBLIC_CARTES_BASE?.replace(/\/$/, "") ?? "";

type Manifeste = { donneesAu: string; rendu: string; largeur: number; hauteur: number; cartes: { slug: string }[] };
const manifestes = new Map<PeriodKey, Promise<Manifeste | null>>();

function manifeste(periode: PeriodKey): Promise<Manifeste | null> {
  let p = manifestes.get(periode);
  if (!p) {
    p = fetch(`${BASE}/${periode}/manifeste.json`, { cache: "no-cache" })
      .then((r) => (r.ok ? (r.json() as Promise<Manifeste>) : null))
      .catch(() => null);
    manifestes.set(periode, p);
  }
  return p;
}

const PAPIER = "#F3ECDD";
const ENCRE = "#1C1917";

/** Une face, avec sa bande d'estampille sous le carton. */
async function faceEstampillee(url: string, ligne: string, echelle: number): Promise<Blob> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const image = await createImageBitmap(await res.blob());
  const bande = Math.round(60 * echelle);
  const canevas = document.createElement("canvas");
  canevas.width = image.width;
  canevas.height = image.height + bande;
  const ctx = canevas.getContext("2d");
  if (!ctx) throw new Error("canevas indisponible");
  ctx.fillStyle = PAPIER;
  ctx.fillRect(0, 0, canevas.width, canevas.height);
  ctx.drawImage(image, 0, 0);
  ctx.fillStyle = ENCRE;
  ctx.font = `500 ${Math.round(19 * echelle)}px "IBM Plex Mono", monospace`;
  ctx.textBaseline = "middle";
  ctx.textAlign = "center";
  ctx.fillText(ligne, canevas.width / 2, image.height + bande / 2);
  return new Promise((ok, non) => canevas.toBlob((b) => (b ? ok(b) : non(new Error("export impossible"))), "image/png"));
}

function enregistrer(blob: Blob, nom: string): void {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = nom;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
}

const DATE = new Intl.DateTimeFormat("fr-CA", { day: "numeric", month: "long", year: "numeric", timeZone: "America/Toronto" });
const HEURE = new Intl.DateTimeFormat("fr-CA", { hour: "numeric", minute: "2-digit", timeZone: "America/Toronto" });

export function TelechargerCarte({ periode, slug, nom }: { periode: PeriodKey; slug: string; nom: string }) {
  const [etat, setEtat] = useState<"inconnu" | "prete" | "absente" | "en-cours" | "erreur">("inconnu");
  const [donneesAu, setDonneesAu] = useState<string>("");

  useEffect(() => {
    if (!BASE) return;
    let actif = true;
    manifeste(periode).then((m) => {
      if (!actif) return;
      if (!m) { setEtat("absente"); return; }
      setDonneesAu(m.donneesAu);
      setEtat(m.cartes.some((c) => c.slug === slug) ? "prete" : "absente");
    });
    return () => { actif = false; };
  }, [periode, slug]);

  if (!BASE || etat === "inconnu") return null;
  if (etat === "absente") {
    return <span className="carte-telecharger est-absente" title="Les cartes à télécharger sont préparées après chaque mise à jour des données.">Téléchargement bientôt disponible</span>;
  }

  const telecharger = async () => {
    setEtat("en-cours");
    try {
      const m = await manifeste(periode);
      const echelle = m ? m.largeur / 1071 : 2;
      const maintenant = new Date();
      const ligne = `Téléchargée le ${DATE.format(maintenant)} à ${HEURE.format(maintenant).replace(":", " h ")} · données au ${donneesAu.replace(/^\p{L}+ (?=\d)/u, "")} · vitrinedemocratique.com`;
      const base = nom.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
      for (const face of ["recto", "verso"] as const) {
        const blob = await faceEstampillee(`${BASE}/${periode}/${slug}-${face}.png`, ligne, echelle);
        enregistrer(blob, `carte-${base}-${face}.png`);
      }
      setEtat("prete");
    } catch {
      setEtat("erreur");
    }
  };

  return (
    <button type="button" className="carte-telecharger" onClick={telecharger} disabled={etat === "en-cours"}>
      {etat === "en-cours" ? "Préparation…" : etat === "erreur" ? "Réessayer le téléchargement" : "Télécharger la carte (recto et verso)"}
    </button>
  );
}

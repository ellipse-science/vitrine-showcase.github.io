// Banc de validation du dossier #430 — PAS une page publique.
//
// Rend la Une des Unes telle qu'elle était à n'importe quelle édition du
// snapshot, avec TOUTES les règles décidées le 2026-08-09 et le nouvel indice
// allumé. Sert à valider à l'œil, édition par édition, plutôt que sur des
// tableaux de chiffres.
//
// Préfigure vitrine#434 : une page PRÉ-RENDUE par édition (generateStaticParams),
// seule voie compatible avec `output: export` — le rendu dynamique est refusé
// par la configuration. C'est la « voie 1 » décrite dans l'issue, et elle donne
// une URL stable par édition.
import Link from "next/link";
import fs from "node:fs/promises";
import path from "node:path";
import { loadHeadlineEvents, __test__ } from "@/lib/data/headlineEvents";
import { SALIENCE_CUTOVER } from "@/lib/data/salienceCutover";
import { UneDesUnesSection } from "@/components/sections/UneDesUnesSection";

export async function blocsDuSnapshot(): Promise<string[]> {
  const raw = await fs.readFile(path.resolve(process.cwd(), "public/data/headline-events.json"), "utf8");
  const { blockKey } = __test__ as unknown as { blockKey: (e: unknown) => string };
  return Array.from(new Set((JSON.parse(raw) as unknown[]).map(blockKey))).sort();
}

// Heure de PUBLICATION d'un bloc = fin + 1 h, en heure de Montréal (réforme #195).
export function libelle(bloc: string): { jour: string; heure: string } {
  const pub = new Date(new Date(`${bloc}:00:00Z`).getTime() + 5 * 3_600_000);
  const p = Object.fromEntries(new Intl.DateTimeFormat("fr-CA", {
    timeZone: "America/Toronto", weekday: "short", day: "numeric", month: "short", hour: "2-digit", hour12: false,
  }).formatToParts(pub).map((x) => [x.type, x.value]));
  return { jour: `${p.weekday} ${p.day} ${p.month}`, heure: p.hour === "00" ? "minuit" : `${Number(p.hour)}h` };
}

const bouton: React.CSSProperties = {
  fontFamily: "ui-monospace, monospace", fontSize: "1rem", padding: "0.3rem 0.7rem",
  border: "1px solid #d9d0bf", borderRadius: "2px", textDecoration: "none", color: "inherit",
};
const pastille: React.CSSProperties = {
  fontFamily: "ui-monospace, monospace", fontSize: "0.72rem", padding: "0.3rem 0.55rem",
  border: "1px solid", borderRadius: "2px", textDecoration: "none", minWidth: "3.2rem", textAlign: "center",
};

export async function Banc({ bloc }: { bloc: string }) {
  const blocs = await blocsDuSnapshot();
  const i = Math.max(0, blocs.indexOf(bloc));
  const data = await loadHeadlineEvents(bloc);
  const lien = (k: number) => `/validation/${blocs[k]}`;
  const l = libelle(bloc);

  return (
    <div className="page" style={{ paddingBottom: "4rem" }}>
      <div style={{ background: "#2b2118", color: "#f0e9dc", padding: "0.7rem 1rem",
        fontFamily: "ui-monospace, monospace", fontSize: "0.72rem", letterSpacing: "0.05em" }}>
        BANC DE VALIDATION · dossier #430 · indice {SALIENCE_CUTOVER ? "SPEC V1 (nouvel algo)" : "ancien"} ·
        toutes les règles du 9 août · {blocs.length} éditions
      </div>

      <nav style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "0.35rem",
        flexWrap: "wrap", padding: "1rem", borderBottom: "1px solid #d9d0bf" }}>
        <Link href={lien(Math.max(0, i - 1))} aria-label="Édition précédente"
          style={{ ...bouton, opacity: i === 0 ? 0.3 : 1, pointerEvents: i === 0 ? "none" : "auto" }}>←</Link>
        {blocs.map((b, k) => (
          <Link key={b} href={lien(k)} title={`${libelle(b).jour} · ${libelle(b).heure}`} style={{
            ...pastille,
            background: k === i ? "#a85a52" : k < i ? "rgba(168,90,82,0.14)" : "transparent",
            color: k === i ? "#fff8f0" : "inherit",
            borderColor: k === i ? "transparent" : "#d9d0bf",
            opacity: k > i ? 0.35 : 1,
          }}>{libelle(b).heure}</Link>
        ))}
        <Link href={lien(Math.min(blocs.length - 1, i + 1))} aria-label="Édition suivante"
          style={{ ...bouton, opacity: i === blocs.length - 1 ? 0.3 : 1, pointerEvents: i === blocs.length - 1 ? "none" : "auto" }}>→</Link>
        <span style={{ width: "100%", textAlign: "center", fontFamily: "ui-monospace, monospace",
          fontSize: "0.76rem", color: "#6e645a", marginTop: "0.55rem" }}>
          {l.jour} · édition de {l.heure} · <strong>{data?.top3.length ?? 0} manchette(s)</strong>
        </span>
      </nav>

      <div id="une-des-unes" data-section="Une des unes">
        <UneDesUnesSection asOf={bloc} />
      </div>
    </div>
  );
}

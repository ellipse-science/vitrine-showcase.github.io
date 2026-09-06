// Logique PURE de l'illustration de la Une au build : aucune E/S ici, exprès.
// scripts/ensure_art.ts fait les appels réseau et disque ; ce module est ce
// que tests/ensureArt.test.ts éprouve.
//
// C'est un PORTAGE FIDÈLE de aws-refiners/refiners/vitrine-art/
// generate_publish.py (sélection des références, digest des articles, prompt,
// métadonnées) : l'image faite au build doit être la même que celle que le
// raffineur aurait faite. Toute divergence de style entre les deux circuits
// se verrait à l'écran.

/** Les quatre fichiers que le build dépose dans public/data/generated-art/,
 *  et que UneDesUnesSection, lib/shareUneArt.ts et postbuild connaissent. */
export const ART_LOCAL_FILES = ["latest.png", "latest.webp", "latest.avif", "latest.json"] as const;
export type ArtFile = (typeof ART_LOCAL_FILES)[number];

/** Même expression que `parseUne` côté Worker (workers/api/src/art-logic.ts) :
 *  une storyline `story-…-01a5194c` ou un event_id `20260903T150000Z-evt-…`.
 *  Minuscules, chiffres, tirets simples : rien qui puisse remonter un chemin. */
export const UNE_KEY_RE = /^(?:story|\d{8}T\d{6}Z-evt)-[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const UNE_KEY_MAX_LENGTH = 160;

export type HeroLike = { storyline_id?: string | null; event_id?: string | null };

/** La clé sous laquelle l'image de cette Une est rangée : la storyline
 *  d'abord (elle suit l'histoire à travers les blocs de 4 h), l'event_id à
 *  défaut. Même règle que `heroKey` du Worker et que la garde d'appariement
 *  de UneDesUnesSection. `null` si la clé n'a pas la forme attendue. */
export function uneKey(hero: HeroLike | null): string | null {
  if (!hero) return null;
  const key = hero.storyline_id ?? hero.event_id ?? null;
  if (!key || key.length > UNE_KEY_MAX_LENGTH || !UNE_KEY_RE.test(key)) return null;
  return key;
}

/** Dix références du sujet (préfixe de l'enjeu) puis dix au hasard parmi les
 *  autres — `select_reference_images` du raffineur. `random` est injecté pour
 *  que le test soit déterministe. Moins de vingt s'il n'y en a pas assez. */
export function selectReferenceNames(
  names: readonly string[],
  mainIssue: string,
  random: () => number = Math.random,
  nTopic = 10,
  nTotal = 20,
): string[] {
  const all = [...new Set(names)].sort();
  const topic = all.filter((n) => n.startsWith(mainIssue));
  const pool = all.filter((n) => !n.startsWith(mainIssue));
  const selected = topic.slice(0, nTopic);
  while (selected.length < nTotal && pool.length > 0) {
    const i = Math.min(pool.length - 1, Math.floor(random() * pool.length));
    selected.push(pool.splice(i, 1)[0]);
  }
  return selected;
}

type Article = { media_id?: string | null; body_preview?: string | null; language?: string | null };

/** Extraits factuels de quatre rédactions au plus, en français d'abord puis en
 *  anglais, un média une seule fois, 300 caractères chacun —
 *  `build_context_digest` du raffineur. Dans headline_events_4h, `articles`
 *  arrive sous forme de chaîne JSON ; on accepte aussi un tableau déjà lu. */
export function buildContextDigest(
  raw: unknown,
  maxOutlets = 4,
  maxChars = 300,
): { digest: string; outlets: string[] } {
  const vide = { digest: "", outlets: [] as string[] };
  let articles: unknown = raw;
  if (typeof raw === "string") {
    try {
      articles = JSON.parse(raw);
    } catch {
      return vide;
    }
  }
  if (!Array.isArray(articles) || articles.length === 0) return vide;

  const usable = (a: Article) => Boolean(a.media_id) && Boolean((a.body_preview ?? "").trim());
  const picked = new Map<string, Article>();
  for (const lang of ["fr", "en"]) {
    for (const a of articles as Article[]) {
      if (picked.size >= maxOutlets) break;
      if (!a || typeof a !== "object" || !usable(a) || picked.has(a.media_id as string)) continue;
      if ((a.language ?? "").toLowerCase() === lang) picked.set(a.media_id as string, a);
    }
  }
  if (picked.size === 0) return vide;

  const lines = [...picked.values()].map(
    (a) => `- ${(a.body_preview ?? "").trim().split(/\s+/).join(" ").slice(0, maxChars)}`,
  );
  return { digest: lines.join("\n"), outlets: [...picked.keys()] };
}

/** Le prompt, mot pour mot celui du raffineur (`build_prompt`) : même style,
 *  même neutralité éditoriale, même interdiction des personnes et du texte. */
export function buildPrompt(headline: string, mainIssueTextFr: string, contextDigest = ""): string {
  const parts = [
    "These reference images are editorial illustrations by our in-house artist. " +
      "Generate a new editorial illustration in the same visual style " +
      "(palette, composition, abstraction level, artistic treatment) " +
      `depicting this news headline: «${headline}» ` +
      `(topic: ${mainIssueTextFr}).`,
  ];
  if (contextDigest) {
    parts.push(
      "The following are factual excerpts from several independent newsrooms " +
        "covering the same event, provided only so you understand the subject — " +
        "not to be depicted literally:\n" +
        contextDigest,
    );
  }
  parts.push(
    "Adopt a detached, neutral editorial stance. Do not imply the news is good " +
      "or bad and do not take a side. Avoid celebratory cues (triumphant or golden " +
      "light, clear blue skies, smiling harmony, upward momentum) and equally avoid " +
      "catastrophic cues (darkness, storms, decay, conflict, ruin). Represent the " +
      "subject symbolically and even-handedly, with a neutral colour temperature, " +
      "balanced composition, and restraint rather than drama.",
  );
  parts.push(
    "Do not depict human figures, people, faces, heads, or bodies of any " +
      "kind — no silhouettes of persons, no crowds, no portraits. Represent " +
      "the subject and any meeting or relationship purely through non-human " +
      "symbolism: national or regional symbols and their colours, two abstract " +
      "converging or interlocking forms, an abstract handshake reduced to " +
      "simple geometric shapes, paired skylines or landmarks, flags or " +
      "banners. The composition must contain zero human beings.",
  );
  parts.push(
    "Absolutely no text of any kind: no words, no letters, no numbers, " +
      "no captions, no titles, no signatures, no watermarks. " +
      "No logos, no photographs. The image must contain zero written characters.",
  );
  return parts.join("\n\n");
}

/** Où la génération (donc la facture OpenAI) est permise.
 *
 *  Une clé OpenAI absente = lecture seule du cache par histoire, jamais un
 *  échec. Avec la clé : les builds de `develop` et de `main` génèrent (c'est
 *  ce qui met l'image en ligne) ; un aperçu de branche ou un build de PR ne
 *  génère pas, il reprend l'image si elle existe. `VITRINE_ART_GENERATE=1`
 *  force (essai local), `=0` coupe partout.
 *
 *  LA BRANCHE VIENT DE DEUX ENDROITS, et il faut les deux. Cloudflare Pages
 *  pose `CF_PAGES_BRANCH` ; mais depuis le gel de l'intégration Git du
 *  2026-08-30, nos vrais déploiements bâtissent dans GitHub Actions
 *  (deploy-prod.yml, deploy-dev-cloudflare.yml, puis `wrangler pages deploy`),
 *  où seule `GITHUB_REF_NAME` existe. Sans elle, la garde répondrait « hors
 *  Pages » à chaque édition et personne ne le verrait (revue d'Adrien, #728).
 *  Sur une PR, `GITHUB_REF_NAME` vaut `<n>/merge` : refusé, comme un aperçu. */
export function generationAllowed(env: Record<string, string | undefined>): { allowed: boolean; reason: string } {
  if (!env.OPENAI_API_KEY) return { allowed: false, reason: "OPENAI_API_KEY absente" };
  if (env.VITRINE_ART_GENERATE === "0") return { allowed: false, reason: "VITRINE_ART_GENERATE=0" };
  if (env.VITRINE_ART_GENERATE === "1") return { allowed: true, reason: "VITRINE_ART_GENERATE=1" };
  const branch = env.CF_PAGES_BRANCH ?? env.GITHUB_REF_NAME;
  const source = env.CF_PAGES_BRANCH ? "Pages" : "Actions";
  if (branch === "develop" || branch === "main") return { allowed: true, reason: `branche ${branch} (${source})` };
  if (branch) return { allowed: false, reason: `branche d'aperçu ${branch} (${source})` };
  return { allowed: false, reason: "hors Cloudflare Pages et hors GitHub Actions (ni CF_PAGES_BRANCH ni GITHUB_REF_NAME)" };
}

/** Le corps de la requête à l'API Responses : vingt références en
 *  `input_image` (détail `low`, comme le raffineur), le prompt, et l'outil
 *  `image_generation` en qualité `medium`, 1024×1024. */
export function buildResponsesRequest(prompt: string, referenceB64s: readonly string[], quality = "medium") {
  return {
    model: "gpt-4o",
    input: [
      {
        role: "user",
        content: [
          ...referenceB64s.map((b64) => ({
            type: "input_image",
            image_url: `data:image/jpeg;base64,${b64}`,
            detail: "low",
          })),
          { type: "input_text", text: prompt },
        ],
      },
    ],
    tools: [{ type: "image_generation", quality, size: "1024x1024" }],
  };
}

/** L'image base64 dans la réponse de l'API Responses, ou `null`. */
export function extractImageB64(response: unknown): string | null {
  const output = (response as { output?: unknown } | null)?.output;
  if (!Array.isArray(output)) return null;
  for (const item of output) {
    if (item && typeof item === "object" && (item as { type?: string }).type === "image_generation_call") {
      const result = (item as { result?: unknown }).result;
      if (typeof result === "string" && result.length > 0) return result;
    }
  }
  return null;
}

/** Les métadonnées de `latest.json`, dans la forme que lisent la garde
 *  d'appariement, la carte de partage et le raffineur. `generated_by` en plus,
 *  pour savoir d'un coup d'œil qui a fait l'image. */
export function buildMetadata(
  hero: { event_id: string; storyline_id: string | null; title: string | null },
  mainIssue: string,
  mainIssueTextFr: string,
  contextOutlets: string[],
  now: Date,
) {
  return {
    generated_at: now.toISOString().slice(0, 16) + "Z",
    event_id: hero.event_id,
    storyline_id: hero.storyline_id,
    headline_fr: hero.title ?? "",
    main_issue: mainIssue,
    main_issue_text_fr: mainIssueTextFr,
    context_outlets: contextOutlets,
    generated_by: "build",
  };
}

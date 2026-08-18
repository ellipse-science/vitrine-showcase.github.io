// Administration des clés d'API : émission, révocation, portées, quotas, usage.
//
// ── PROTECTION ──────────────────────────────────────────────────────────────
//
// Ces routes ne portent AUCUNE authentification applicative. Elles sont
// protégées par une application Cloudflare Access placée devant
// `api.vitrinedemocratique.com/admin*`, exactement comme le miroir dev.
//
// Ce choix est délibéré : écrire un second système de mots de passe, c'est
// écrire un second système à tenir à jour, à faire tourner et à auditer. Access
// fait déjà de l'identité (code à usage unique par courriel, sans mot de passe
// à partager) et journalise les accès.
//
// LE COROLLAIRE EST CRITIQUE : si l'application Access est retirée ou mal
// configurée, ces routes deviennent publiques et n'importe qui peut émettre une
// clé. D'où le garde-fou ci-dessous, qui REFUSE de servir /admin sans en-tête
// d'identité Access. Mieux vaut une administration inaccessible qu'ouverte.

import type { NeonQueryFunction } from '@neondatabase/serverless'

import { mintKey } from './auth'

/** Identité prouvée par Cloudflare Access, ou null.
 *
 *  Access injecte `Cf-Access-Authenticated-User-Email` après avoir vérifié
 *  l'identité. L'en-tête ne peut pas être forgé de l'extérieur : Cloudflare
 *  écrase toute valeur fournie par le client avant d'atteindre le Worker. */
export function accessUser(request: Request): string | null {
  const email = request.headers.get('cf-access-authenticated-user-email')
  return email && email.includes('@') ? email : null
}

async function log(
  sql: NeonQueryFunction<false, false>,
  actor: string,
  action: string,
  keyId: string | null,
  prefix: string | null,
  detail: unknown,
): Promise<void> {
  await sql.query(
    `INSERT INTO api.admin_log (actor, action, key_id, key_prefix, detail)
     VALUES ($1, $2, $3, $4, $5)`,
    [actor, action, keyId, prefix, JSON.stringify(detail ?? {})],
  )
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body, null, 2) + '\n', {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  })
}

export async function handleAdmin(
  request: Request,
  sql: NeonQueryFunction<false, false>,
  segments: string[],
): Promise<Response> {
  const actor = accessUser(request)
  if (!actor) {
    // Voir le commentaire d'en-tête : on préfère fermer que risquer d'ouvrir.
    return json(
      {
        error:
          "Administration inaccessible : aucune identité Cloudflare Access n'a été " +
          'présentée. Si vous voyez ceci depuis un navigateur connecté, ' +
          "l'application Access devant /admin est absente ou mal configurée.",
      },
      403,
    )
  }

  // GET /admin — la page
  if (segments.length === 1 && request.method === 'GET') {
    return new Response(adminPage(actor), {
      headers: { 'content-type': 'text/html; charset=utf-8' },
    })
  }

  // GET /admin/keys — liste (jamais les clés elles-mêmes, seulement leurs préfixes)
  if (segments[1] === 'keys' && request.method === 'GET') {
    const keys = await sql.query(
      `SELECT k.id, k.name, k.prefix, k.scopes, k.daily_quota, k.owner_email, k.note,
              k.created_at, k.created_by, k.last_used_at, k.revoked_at,
              COALESCE((SELECT SUM(requests) FROM api.usage u
                         WHERE u.key_id = k.id AND u.day = CURRENT_DATE), 0)::int AS today
         FROM api.keys k ORDER BY k.revoked_at NULLS FIRST, k.created_at DESC`,
    )
    return json({ keys })
  }

  // POST /admin/keys — émission
  if (segments[1] === 'keys' && request.method === 'POST') {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
    const name = String(body.name ?? '').trim()
    if (!name) return json({ error: 'Un nom est requis.' }, 400)

    const scopes = Array.isArray(body.scopes) ? body.scopes.map(String) : []
    if (scopes.length === 0) return json({ error: 'Choisissez au moins un jeu de données.' }, 400)

    const quota =
      body.daily_quota === null || body.daily_quota === undefined || body.daily_quota === ''
        ? null
        : Number(body.daily_quota)
    if (quota !== null && (!Number.isFinite(quota) || quota <= 0)) {
      return json({ error: 'Le quota doit être un entier positif, ou vide pour illimité.' }, 400)
    }

    const { raw, hash, prefix } = await mintKey()
    const rows = (await sql.query(
      `INSERT INTO api.keys (name, key_hash, prefix, scopes, daily_quota, owner_email, note, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id`,
      [name, hash, prefix, scopes, quota, String(body.owner_email ?? '') || null,
       String(body.note ?? '') || null, actor],
    )) as { id: string }[]

    await log(sql, actor, 'create', rows[0].id, prefix, { name, scopes, quota })

    // La seule fois où la clé en clair existe hors du client.
    return json({
      key: raw,
      prefix,
      warning:
        "Cette clé ne sera plus jamais affichée. Copiez-la maintenant — seule son empreinte est conservée.",
    })
  }

  // POST /admin/keys/:id/revoke
  if (segments[1] === 'keys' && segments[3] === 'revoke' && request.method === 'POST') {
    const id = segments[2]
    const rows = (await sql.query(
      `UPDATE api.keys SET revoked_at = now(), revoked_by = $2
        WHERE id = $1 AND revoked_at IS NULL RETURNING prefix`,
      [id, actor],
    )) as { prefix: string }[]
    if (rows.length === 0) return json({ error: 'Clé inconnue ou déjà révoquée.' }, 404)
    await log(sql, actor, 'revoke', id, rows[0].prefix, {})
    return json({ revoked: rows[0].prefix })
  }

  // GET /admin/usage — usage des 30 derniers jours
  if (segments[1] === 'usage' && request.method === 'GET') {
    const usage = await sql.query(
      `SELECT u.day, k.name, k.prefix, u.dataset, u.requests, u.rows_out
         FROM api.usage u JOIN api.keys k ON k.id = u.key_id
        WHERE u.day >= CURRENT_DATE - 30
        ORDER BY u.day DESC, u.requests DESC LIMIT 500`,
    )
    return json({ usage })
  }

  // GET /admin/log
  if (segments[1] === 'log' && request.method === 'GET') {
    const entries = await sql.query(
      `SELECT at, actor, action, key_prefix, detail FROM api.admin_log
        ORDER BY at DESC LIMIT 200`,
    )
    return json({ log: entries })
  }

  return json({ error: 'Route inconnue.' }, 404)
}

/** Page d'administration : un seul fichier, sans dépendance ni build.
 *
 *  Volontairement en HTML nu servi par le Worker. Un projet front séparé pour
 *  cinq formulaires coûterait plus à maintenir qu'il ne rapporte, et cette page
 *  doit rester lisible par quelqu'un qui n'a pas le dépôt sous la main. */
function adminPage(actor: string): string {
  return `<!doctype html>
<html lang="fr">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Vitrine — administration de l'API</title>
<style>
  :root { color-scheme: light dark; --line:#8883; }
  body { font: 15px/1.5 ui-sans-serif, system-ui, sans-serif; margin: 0; padding: 2rem 1.25rem 4rem; max-width: 68rem; margin-inline: auto; }
  h1 { font-size: 1.35rem; margin: 0 0 .25rem; }
  .who { color: #7a7a7a; font-size: .85rem; margin-bottom: 2rem; }
  h2 { font-size: 1.05rem; margin: 2.5rem 0 .75rem; }
  table { border-collapse: collapse; width: 100%; font-size: .85rem; }
  th, td { text-align: left; padding: .45rem .6rem; border-bottom: 1px solid var(--line); vertical-align: top; }
  th { font-weight: 600; }
  code { font-family: ui-monospace, monospace; font-size: .85em; }
  .revoked { opacity: .45; }
  form { display: grid; gap: .7rem; max-width: 34rem; }
  label { display: grid; gap: .25rem; font-size: .85rem; }
  input, textarea, select { font: inherit; padding: .4rem .5rem; border: 1px solid var(--line); border-radius: 4px; background: transparent; color: inherit; }
  button { font: inherit; padding: .45rem .9rem; border: 1px solid var(--line); border-radius: 4px; background: transparent; color: inherit; cursor: pointer; }
  button:hover { background: #8881; }
  .scopes { display: grid; grid-template-columns: repeat(auto-fill, minmax(15rem, 1fr)); gap: .2rem; font-size: .8rem; }
  .scopes label { grid-auto-flow: column; justify-content: start; align-items: center; gap: .4rem; }
  .new-key { margin-top: 1rem; padding: .9rem; border: 1px solid var(--line); border-radius: 6px; }
  .new-key code { display: block; word-break: break-all; margin: .5rem 0; font-size: 1rem; }
  .warn { color: #b45309; }
  .empty { color: #7a7a7a; font-style: italic; }
</style>

<h1>Administration de l'API</h1>
<p class="who">Connecté comme <strong>${actor}</strong> — via Cloudflare Access.</p>

<h2>Émettre une clé</h2>
<form id="f">
  <label>Nom <input name="name" required placeholder="Le Devoir — tableau de bord"></label>
  <label>Courriel du titulaire <input name="owner_email" type="email" placeholder="contact@exemple.org"></label>
  <label>Quota quotidien <input name="daily_quota" type="number" min="1" placeholder="vide = illimité"></label>
  <label>Note <textarea name="note" rows="2" placeholder="Contexte, entente, date de fin…"></textarea></label>
  <fieldset style="border:1px solid var(--line); border-radius:4px;">
    <legend style="font-size:.85rem">Jeux de données accessibles</legend>
    <div class="scopes" id="scopes"></div>
  </fieldset>
  <button>Émettre la clé</button>
</form>
<div id="out"></div>

<h2>Clés</h2>
<div id="keys" class="empty">chargement…</div>

<h2>Usage (30 derniers jours)</h2>
<div id="usage" class="empty">chargement…</div>

<script>
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));

async function loadScopes() {
  const r = await fetch('/v1/datasets').then(r => r.json());
  $('scopes').innerHTML =
    '<label><input type="checkbox" name="scope" value="*"><strong>Tous les jeux</strong></label>' +
    r.datasets.map(d => \`<label><input type="checkbox" name="scope" value="\${esc(d.name)}">\${esc(d.name)}</label>\`).join('');
}

async function loadKeys() {
  const { keys } = await fetch('/admin/keys').then(r => r.json());
  if (!keys.length) { $('keys').textContent = 'Aucune clé émise.'; return; }
  $('keys').className = '';
  $('keys').innerHTML = '<table><tr><th>Nom</th><th>Préfixe</th><th>Portées</th><th>Quota</th><th>Aujourd\\'hui</th><th>Dernier usage</th><th></th></tr>' +
    keys.map(k => \`<tr class="\${k.revoked_at ? 'revoked' : ''}">
      <td>\${esc(k.name)}\${k.owner_email ? '<br><small>' + esc(k.owner_email) + '</small>' : ''}</td>
      <td><code>\${esc(k.prefix)}…</code></td>
      <td>\${k.scopes.includes('*') ? '<em>tous</em>' : esc(k.scopes.join(', '))}</td>
      <td>\${k.daily_quota ?? '<em>illimité</em>'}</td>
      <td>\${k.today}</td>
      <td>\${k.last_used_at ? esc(k.last_used_at.slice(0,16).replace('T',' ')) : '<em>jamais</em>'}</td>
      <td>\${k.revoked_at ? 'révoquée' : '<button data-id="' + k.id + '">Révoquer</button>'}</td>
    </tr>\`).join('') + '</table>';
  $('keys').querySelectorAll('button[data-id]').forEach(b => b.onclick = async () => {
    if (!confirm('Révoquer cette clé ? Elle cessera de fonctionner immédiatement et ne peut pas être réactivée.')) return;
    await fetch('/admin/keys/' + b.dataset.id + '/revoke', { method: 'POST' });
    loadKeys();
  });
}

async function loadUsage() {
  const { usage } = await fetch('/admin/usage').then(r => r.json());
  if (!usage.length) { $('usage').textContent = 'Aucun usage enregistré.'; return; }
  $('usage').className = '';
  $('usage').innerHTML = '<table><tr><th>Jour</th><th>Clé</th><th>Jeu</th><th>Requêtes</th><th>Lignes</th></tr>' +
    usage.map(u => \`<tr><td>\${esc(String(u.day).slice(0,10))}</td><td>\${esc(u.name)}</td>
      <td>\${esc(u.dataset)}</td><td>\${u.requests}</td><td>\${u.rows_out}</td></tr>\`).join('') + '</table>';
}

$('f').onsubmit = async (e) => {
  e.preventDefault();
  const fd = new FormData(e.target);
  const scopes = [...e.target.querySelectorAll('input[name=scope]:checked')].map(i => i.value);
  const res = await fetch('/admin/keys', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      name: fd.get('name'), owner_email: fd.get('owner_email'),
      daily_quota: fd.get('daily_quota'), note: fd.get('note'), scopes,
    }),
  }).then(r => r.json());
  if (res.error) { $('out').innerHTML = '<p class="warn">' + esc(res.error) + '</p>'; return; }
  $('out').innerHTML = '<div class="new-key"><strong>Clé émise</strong><code>' + esc(res.key) +
    '</code><p class="warn">' + esc(res.warning) + '</p></div>';
  e.target.reset();
  loadKeys();
};

loadScopes(); loadKeys(); loadUsage();
</script>
</html>`
}

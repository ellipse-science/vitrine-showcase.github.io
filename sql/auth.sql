-- Authentification et quotas de l'API payante.
--
-- ÉCRIT À LA MAIN, contrairement à sql/schema.sql qui est généré depuis
-- scripts/tables.json. Ces tables ne décrivent pas de la donnée publiée : elles
-- décrivent qui a le droit de la lire.
--
-- Appliquer : node scripts/apply_sql.mjs sql/auth.sql

CREATE SCHEMA IF NOT EXISTS api;

-- ─────────────────────────────────────────────────────────────────────────────
-- Clés d'API
--
-- LA CLÉ EN CLAIR N'EST JAMAIS STOCKÉE. On garde son SHA-256, comme un mot de
-- passe. Une base qui fuite ne livre alors aucune clé utilisable, et personne —
-- pas même un administrateur — ne peut relire une clé existante : on en émet
-- une nouvelle. La clé n'est montrée qu'une fois, à sa création.
--
-- `prefix` est les douze premiers caractères, conservés en clair : c'est ce qui
-- permet de reconnaître une clé dans une liste ou un journal sans la révéler.
CREATE TABLE IF NOT EXISTS api.keys (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name         text        NOT NULL,
  key_hash     text        NOT NULL UNIQUE,
  prefix       text        NOT NULL,

  -- Jeux de données autorisés. `{"*"}` donne accès à tout.
  -- Un tableau plutôt qu'une table de jointure : la liste est courte, lue à
  -- chaque requête, et le contrat des noms vit déjà dans scripts/tables.json.
  scopes       text[]      NOT NULL DEFAULT '{}',

  -- Plafond de requêtes par jour UTC. NULL = illimité (usage interne).
  daily_quota  integer,

  owner_email  text,
  note         text,

  created_at   timestamptz NOT NULL DEFAULT now(),
  created_by   text,
  last_used_at timestamptz,
  revoked_at   timestamptz,
  revoked_by   text
);

-- La recherche se fait par hash à chaque requête authentifiée : c'est le seul
-- accès chaud, et il doit rester en index unique.
CREATE INDEX IF NOT EXISTS keys_active_idx ON api.keys (key_hash) WHERE revoked_at IS NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- Usage, agrégé par clé et par jour
--
-- Un compteur par jour plutôt qu'un journal ligne à ligne : le quota est
-- quotidien, la facturation le sera aussi, et une table qui grossit d'une ligne
-- par requête deviendrait le premier problème d'exploitation de l'API.
CREATE TABLE IF NOT EXISTS api.usage (
  key_id   uuid NOT NULL REFERENCES api.keys(id) ON DELETE CASCADE,
  day      date NOT NULL,
  dataset  text NOT NULL,
  requests integer NOT NULL DEFAULT 0,
  rows_out bigint  NOT NULL DEFAULT 0,
  PRIMARY KEY (key_id, day, dataset)
);

CREATE INDEX IF NOT EXISTS usage_day_idx ON api.usage (day DESC);

-- ─────────────────────────────────────────────────────────────────────────────
-- Journal d'administration
--
-- Qui a créé ou révoqué quelle clé, et quand. Cloudflare Access garantit
-- l'identité devant /admin ; on la conserve ici pour que l'historique survive
-- au-delà de ses journaux.
CREATE TABLE IF NOT EXISTS api.admin_log (
  id         bigserial PRIMARY KEY,
  at         timestamptz NOT NULL DEFAULT now(),
  actor      text        NOT NULL,
  action     text        NOT NULL,
  key_id     uuid,
  key_prefix text,
  detail     jsonb
);

CREATE INDEX IF NOT EXISTS admin_log_at_idx ON api.admin_log (at DESC);

#!/usr/bin/env python3
"""PreToolUse guard — applique de façon déterministe deux règles dures d'AGENTS.md.

Reçoit le JSON du tool sur stdin. Code de sortie 2 = bloque l'action (le message
stderr est renvoyé à l'agent). Sinon 0 = autorise.
"""
import sys, json

try:
    data = json.load(sys.stdin)
except Exception:
    sys.exit(0)  # en cas de doute, ne pas bloquer

t = data.get("tool_input", {}) or {}
path = t.get("file_path", "") or ""
content = t.get("content") or t.get("new_string") or ""

# Règle dure #1 — public/data/ est généré par scripts/fetch_data.R, jamais à la main.
if "/public/data/" in path or path.startswith("public/data/"):
    sys.stderr.write(
        "BLOQUÉ — public/data/ est généré par scripts/fetch_data.R (Athena) et ne doit "
        "jamais être édité à la main (AGENTS.md, règle dure #1). Pour exposer une donnée, "
        "édite scripts/tables.json.\n"
    )
    sys.exit(2)

# Règle dure #3 — aucun chemin de déploiement AWS dans ce repo.
if "aws-actions/configure-aws-credentials" in content:
    sys.stderr.write(
        "BLOQUÉ — ce repo n'a aucun chemin de déploiement AWS (AGENTS.md, règle dure #3). "
        "Les creds AWS servent uniquement au fetch en lecture seule (refresh-data.yml). "
        "Pour la performance/bande passante : docs/cloudflare-pages-migration.md.\n"
    )
    sys.exit(2)

sys.exit(0)

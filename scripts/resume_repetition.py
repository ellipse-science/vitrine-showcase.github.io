#!/usr/bin/env python3
"""Résumé d'une répétition à blanc de fetch_data.R (vitrine#489).

Pour chaque table activée de scripts/tables.json : le fichier de sortie a-t-il
été écrit, combien de lignes, et quelle est la date la plus récente qu'il porte
(date_utc, date_montreal_tz, week_end_date ou tag, selon ce que la table a).
Sortie en Markdown, pensée pour le résumé de job de GitHub Actions. Aucun accès
réseau : ne lit que les fichiers que fetch_data.R vient d'écrire.

    python scripts/resume_repetition.py --env PROD
"""
from __future__ import annotations

import argparse
import json
import os

DATE_KEYS = ("date_utc", "date_montreal_tz", "week_end_date", "period_end_date", "tag")


def rows_of(payload):
    if isinstance(payload, list):
        return payload
    if isinstance(payload, dict):
        for key in ("rows", "data", "events"):
            if isinstance(payload.get(key), list):
                return payload[key]
    return []


def freshest(rows):
    for key in DATE_KEYS:
        values = [str(r[key]) for r in rows if isinstance(r, dict) and r.get(key)]
        if values:
            return f"{key} = {max(values)}"
    return "—"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--env", default=os.environ.get("DATAMART_ENV", "?"))
    ap.add_argument("--config", default="scripts/tables.json")
    args = ap.parse_args()

    config = json.load(open(args.config, encoding="utf-8"))
    tables = [t for t in config.get("tables", []) if t.get("enabled")]

    lines = [f"## Répétition à blanc — datamart {args.env}", "",
             "| Table | Fichier | Lignes | Plus récent |", "|---|---|---|---|"]
    absent = 0
    for t in tables:
        out = t.get("out", "")
        if not out or not os.path.exists(out):
            absent += 1
            lines.append(f"| {t['athena']} | **absent** | | |")
            continue
        try:
            rows = rows_of(json.load(open(out, encoding="utf-8")))
            lines.append(f"| {t['athena']} | écrit | {len(rows)} | {freshest(rows)} |")
        except Exception as exc:  # fichier illisible = aussi grave qu'absent
            absent += 1
            lines.append(f"| {t['athena']} | **illisible** ({exc}) | | |")
    lines += ["", f"**{len(tables)} tables activées, {len(tables) - absent} écrites, {absent} absentes ou illisibles.**"]
    print("\n".join(lines))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

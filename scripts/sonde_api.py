#!/usr/bin/env python3
"""Sonde de l'API de la Vitrine (vitrine#692) : ce que Neon sert aux builds.

Lit /v1/health (sync_state par table) puis, pour les jeux qui datent le site,
pagine /v1/datasets/<jeu> comme le fait lib/data/source.ts (pages de 5000,
no-cache) et imprime le bloc ou la date la plus récente. Markdown pour le
résumé de job. Lecture seule ; la clé vient de VITRINE_API_KEY.

    VITRINE_API_KEY=... python scripts/sonde_api.py
"""
from __future__ import annotations

import json
import os
import sys
import urllib.request

API = os.environ.get("API", "https://api.vitrinedemocratique.com")
KEY = os.environ.get("VITRINE_API_KEY", "")
PAGE = 5000
DATASETS = {
    "headline_events_4h": ("date_utc", "time_interval_utc", "tag"),
    "issues_score_day": ("date_utc", None, "tag"),
    "provincial_parties_salient_shadow_day": ("date_utc", None, "computed_at"),
    "polimetre_plus": ("week_end_date", None, None),
}


def get(path: str):
    req = urllib.request.Request(
        f"{API}{path}",
        headers={
            "Authorization": f"Bearer {KEY}",
            "Cache-Control": "no-cache",
            # Cloudflare répond 403 à l'agent « Python-urllib » avant même de lire
            # la clé (mesuré le 2 septembre 2026) ; un agent nommé passe.
            "User-Agent": "vitrine-sonde/1.0 (+https://github.com/ellipse-science/vitrine-showcase.github.io)",
        },
    )
    with urllib.request.urlopen(req, timeout=120) as res:
        return res.status, json.load(res)


def main() -> int:
    if not KEY:
        print("VITRINE_API_KEY absente : rien à sonder.")
        return 1
    out = ["## Sonde API", ""]
    try:
        status, health = get("/v1/health")
        out += [f"### /v1/health (HTTP {status})", "", "```json", json.dumps(health, ensure_ascii=False, indent=2)[:6000], "```", ""]
    except Exception as exc:
        out += [f"### /v1/health : erreur {exc}", ""]

    out += ["| Jeu | Lignes servies | Plus récent (colonnes de date) | Tag / horodatage max |", "|---|---|---|---|"]
    for name, (date_col, interval_col, stamp_col) in DATASETS.items():
        rows: list[dict] = []
        try:
            offset = 0
            while True:
                status, body = get(f"/v1/datasets/{name}?limit={PAGE}&offset={offset}")
                page = body.get("rows") or []
                rows.extend(page)
                if len(page) < PAGE:
                    break
                offset += PAGE
        except Exception as exc:
            out.append(f"| {name} | erreur {exc} | | |")
            continue
        keys = sorted({(str(r.get(date_col) or ""), str(r.get(interval_col) or "")) for r in rows if r.get(date_col)})
        newest = " ".join(x for x in keys[-1] if x) if keys else "—"
        stamp = max((str(r.get(stamp_col)) for r in rows if stamp_col and r.get(stamp_col)), default="—")
        out.append(f"| {name} | {len(rows)} | {newest} | {stamp} |")
    print("\n".join(out))
    return 0


if __name__ == "__main__":
    sys.exit(main())

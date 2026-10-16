#!/usr/bin/env python3
"""Sonde de l'API de la Vitrine (vitrine#692) : ce que Neon sert aux builds.

Lit /v1/health (sync_state par table) puis, pour les jeux qui datent le site,
pagine /v1/datasets/<jeu> comme le fait lib/data/source.ts (pages de 5000,
no-cache) et imprime le bloc ou la date la plus récente.

COMPARE AUSSI LES DEUX SÉLECTIONS DE LA UNE (aws-refiners#490). Depuis
vitrine#767 et #769, le Worker publie la Une retenue dans l'instantané du
cycle, AVANT le build ; le site continue de publier la sienne au build. Les
deux doivent être identiques — elles appellent la même fonction,
`heroSelectionPayload`. Cette sonde les met côte à côte : c'est la preuve
qu'on exige avant de basculer `vitrine-art` sur l'API plutôt que sur le site
déployé. Une divergence ici, c'est la panne de vitrine#259 qui revient.

Markdown pour le résumé de job. Lecture seule ; la clé vient de
VITRINE_API_KEY, et le jeton d'instantané de SNAPSHOT_TOKEN — sans lui, la
comparaison des sélections est sautée, et la sonde le dit.

    VITRINE_API_KEY=... SNAPSHOT_TOKEN=... python scripts/sonde_api.py
"""
from __future__ import annotations

import json
import os
import re
import sys
import time
import urllib.request

API = os.environ.get("API", "https://api.vitrinedemocratique.com")
SITE = os.environ.get("SITE", "https://vitrinedemocratique.com")
KEY = os.environ.get("VITRINE_API_KEY", "")
# Jeton de l'instantané du Worker — DISTINCT de la clé d'API. La route
# /v1/snapshot/* n'accepte que lui (fermée par défaut, cf.
# workers/api/src/snapshot.ts) : avec la clé d'API elle répond 401, et la
# comparaison ne prouverait rien.
SNAPSHOT = os.environ.get("SNAPSHOT_TOKEN", "")
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
            "Authorization": f"Bearer {SNAPSHOT if path.startswith('/v1/snapshot/') else KEY}",
            "Cache-Control": "no-cache",
            # Cloudflare répond 403 à l'agent « Python-urllib » avant même de lire
            # la clé (mesuré le 2 septembre 2026) ; un agent nommé passe.
            "User-Agent": "vitrine-sonde/1.0 (+https://github.com/ellipse-science/vitrine-showcase.github.io)",
        },
    )
    with urllib.request.urlopen(req, timeout=120) as res:
        return res.status, json.load(res)


def get_public(url: str):
    """GET sans clé — le site n'en demande pas."""
    req = urllib.request.Request(
        url,
        headers={
            "Cache-Control": "no-cache",
            "User-Agent": "vitrine-sonde/1.0 (+https://github.com/ellipse-science/vitrine-showcase.github.io)",
        },
    )
    with urllib.request.urlopen(req, timeout=60) as res:
        return res.status, json.load(res)


CHAMPS_UNE = (
    "event_id",
    "storyline_id",
    "title",
    "main_issue",
    "date_utc",
    "time_interval_utc",
)


def comparer_selections() -> list:
    """Le verdict du Worker contre celui du build.

    Les deux appellent `heroSelectionPayload` sur le même jeu : ils devraient
    être identiques champ pour champ. `event_id` compte le plus — c'est lui qui
    dit à `vitrine-art` quoi illustrer.
    """
    out = ["### Sélection de la Une : Worker contre build", ""]

    if not SNAPSHOT:
        return out + [
            "⚠️ `SNAPSHOT_TOKEN` absent des secrets du dépôt : la route "
            "d'instantané n'accepte que ce jeton, pas la clé d'API. "
            "Comparaison impossible — rien n'est prouvé, dans un sens ni dans l'autre.",
            "",
        ]

    try:
        _, manifest = get("/v1/snapshot/manifest.json")
    except Exception as exc:
        return out + [f"manifeste illisible : {exc}", ""]
    cycle = (manifest or {}).get("cycle")
    if not cycle:
        return out + ["manifeste sans cycle — rien à comparer.", ""]
    out += [
        f"Cycle courant : `{cycle}` (publié {(manifest or {}).get('generated_at', '?')})",
        "",
    ]

    try:
        _, worker = get(f"/v1/snapshot/{cycle}/hero_selection.json")
    except Exception as exc:
        return out + [
            f"⚠️ `hero_selection.json` absent de l'instantané `{cycle}` : {exc}",
            "",
            "Attendu tant que le Worker n'a pas tourné depuis son déploiement.",
            "",
        ]

    try:
        _, site = get_public(f"{SITE}/data/hero-selection.json")
    except Exception as exc:
        return out + [f"sélection du site illisible : {exc}", ""]

    if worker is None and site is None:
        return out + ["Les deux valent `null` — aucune Une à illustrer. Concordance.", ""]

    lignes = ["| Champ | Worker | Site | |", "|---|---|---|---|"]
    accord = True
    for k in CHAMPS_UNE:
        a = (worker or {}).get(k)
        b = (site or {}).get(k)
        ok = a == b
        accord = accord and ok
        marque = "OK" if ok else "DIFFERENT"
        lignes.append(f"| `{k}` | {a} | {b} | {marque} |")
    out += lignes + [""]

    out += [
        "**Les deux sélections concordent.**"
        if accord
        else "**DIVERGENCE — ne pas basculer `vitrine-art` tant que ce n'est pas expliqué.**",
        "",
    ]
    return out


# Pages du site à sonder, et les six modules de l'accueil (ancres de
# app/page.tsx). L'enveloppe <div id=…> est rendue même quand la section
# répond null : un module absent se reconnaît à une enveloppe VIDE.
SITE_PAGES = [p for p in os.environ.get("SITE_PAGES", "/ /edition/2026-09-26T23/ /edition/2026-09-26T19/").split() if p]
MODULES = ["une-des-unes", "deux-solitudes", "enjeux-saillants", "partis-et-couverture", "polimetre-plus", "assemblee-nationale"]


def get_html(url: str) -> tuple[int, str]:
    req = urllib.request.Request(
        url,
        headers={
            "Cache-Control": "no-cache",
            "User-Agent": "vitrine-sonde/1.0 (+https://github.com/ellipse-science/vitrine-showcase.github.io)",
        },
    )
    with urllib.request.urlopen(req, timeout=60) as res:
        return res.status, res.read().decode("utf-8", "replace")


def sonder_modules_site() -> list:
    """Les modules que le SITE sert vraiment, page par page — lus dans le HTML
    servi, pas déduits des fichiers du dépôt (leçon du 27 septembre 2026 : un
    accueil publié sans la Une ni Deux solitudes, fichiers et API complets)."""
    out = ["### Modules servis par le site", ""]
    try:
        _, build = get_public(f"{SITE}/build-id.json")
        out += [f"Build en ligne : `{json.dumps(build, ensure_ascii=False)}`", ""]
    except Exception as exc:
        out += [f"build-id.json illisible : {exc}", ""]
    out += ["| Page | HTTP | octets | titre | " + " | ".join(MODULES) + " |", "|---|---|---|---|" + "---|" * len(MODULES)]
    for page in SITE_PAGES:
        try:
            status, html = get_html(f"{SITE}{page}?sonde={int(time.time())}")
        except Exception as exc:
            out.append(f"| `{page}` | erreur {exc} | | |" + " |" * len(MODULES))
            continue
        cells = []
        for mod in MODULES:
            if f'id="{mod}"' not in html:
                cells.append("absent")
            elif re.search(rf'<div[^>]*id="{mod}"[^>]*></div>', html):
                cells.append("VIDE")
            else:
                cells.append("ok")
        titre = re.search(r"<title>([^<]*)</title>", html)
        out.append(f"| `{page}` | {status} | {len(html)} | {(titre.group(1) if titre else '—')[:60]} | " + " | ".join(cells) + " |")
    return out + [""]


def main() -> int:
    if not KEY:
        print("VITRINE_API_KEY absente : rien à sonder.")
        return 1
    out = ["## Sonde API", ""]
    out += sonder_modules_site()
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
    out += comparer_selections()
    print("\n".join(out))
    return 0


if __name__ == "__main__":
    sys.exit(main())

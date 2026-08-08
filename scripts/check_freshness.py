#!/usr/bin/env python3
"""Alarme de fraîcheur de la Une (réf. aws-refiners#278).

Un retard CONSTANT d'environ 4 h SANS aucune erreur aux logs = un stepper de
la cascade AWS coincé un bloc en arrière — une panne silencieuse de ce genre
est restée invisible ~30 h les 6-7 août 2026. Ce script tourne à chaque fetch
(refresh-data.yml) : il mesure l'âge du bloc le plus frais réellement servi au
site (normal ≈ 1 h au moment du fetch, ≈ 5 h dès qu'un bloc est manqué) et
expose stale/age_h au workflow, qui alerte Slack au-delà du seuil.

Diagnostic quand ça sonne : skill diagnostic-donnees-perimees (repo vitrine),
remède : skill rattrapage-radar-data-prep.
"""
import datetime
import json
import os

PATH = "public/data/headline-events.json"
SEUIL_H = 4.0  # entre le ~1 h nominal et le ~5 h d'un bloc manqué


def fin_bloc_utc(date_utc: str, interval: str) -> datetime.datetime:
    """Fin réelle (UTC) d'un bloc « HH-HH » daté par son jour de DÉBUT."""
    d = datetime.datetime.strptime(date_utc, "%Y-%m-%d").replace(
        tzinfo=datetime.timezone.utc
    )
    start_h, end_h = (int(x) for x in interval.split("-"))
    if end_h == 24:  # bord legacy « 20-24 » : la fin EST minuit du jour suivant
        return d + datetime.timedelta(days=1)
    end = d.replace(hour=end_h)
    if end_h <= start_h:  # bloc qui traverse minuit UTC (ex. « 23-03 »)
        end += datetime.timedelta(days=1)
    return end


def main() -> None:
    with open(PATH, encoding="utf-8") as f:
        rows = json.load(f)
    fin = max(fin_bloc_utc(r["date_utc"], r["time_interval_utc"]) for r in rows)
    age_h = (
        datetime.datetime.now(datetime.timezone.utc) - fin
    ).total_seconds() / 3600
    stale = age_h > SEUIL_H
    print(
        f"Bloc le plus frais : fin {fin:%Y-%m-%d %H:%M} UTC | "
        f"âge {age_h:.1f} h | seuil {SEUIL_H} h | stale={stale}"
    )
    out = os.environ.get("GITHUB_OUTPUT")
    if out:
        with open(out, "a", encoding="utf-8") as f:
            f.write(f"stale={'true' if stale else 'false'}\n")
            f.write(f"age_h={age_h:.1f}\n")


if __name__ == "__main__":
    main()

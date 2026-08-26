#!/usr/bin/env python3
"""Alarme de fraîcheur de la Une (réf. aws-refiners#278).

Un retard CONSTANT d'environ 4 h SANS aucune erreur aux logs = un stepper de
la cascade AWS coincé un bloc en arrière — une panne silencieuse de ce genre
est restée invisible ~30 h les 6-7 août 2026. Ce script tourne à chaque fetch
(refresh-data.yml) : il mesure l'âge du bloc le plus frais réellement servi au
site (normal ≈ 1 h au moment du fetch, ≈ 5 h dès qu'un bloc est manqué) et
expose stale/resume au workflow, qui alerte Slack + Healthchecks au-delà du
seuil.

Un fichier manquant, vide ou illisible est traité comme PÉRIMÉ (c'est le cas
le plus grave : le fetch lui-même est suspect) — jamais comme une erreur de
script, sinon l'alerte ne partirait pas. Sortie toujours 0 ; l'alerte passe
par les outputs.

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


def mesurer() -> tuple[bool, str]:
    """(stale, resume) — toute erreur de lecture = périmé, avec le motif."""
    try:
        with open(PATH, encoding="utf-8") as f:
            rows = json.load(f)
        fin = max(fin_bloc_utc(r["date_utc"], r["time_interval_utc"]) for r in rows)
    except Exception as e:  # fichier absent/vide/corrompu, colonne manquante…
        return True, (
            f"{PATH} manquant, vide ou illisible ({type(e).__name__}: {e}) — "
            "le fetch lui-même est suspect"
        )
    age_h = (
        datetime.datetime.now(datetime.timezone.utc) - fin
    ).total_seconds() / 3600
    if age_h > SEUIL_H:
        return True, (
            f"bloc le plus frais vieux de {age_h:.1f} h (normal ≈ 1 h au "
            "fetch) — suspect n°1 : stepper de la cascade coincé un bloc en "
            "arrière (réf. aws-refiners#278)"
        )
    return False, f"Fraîcheur OK : bloc le plus frais vieux de {age_h:.1f} h"


def main() -> None:
    stale, resume = mesurer()
    print(f"stale={stale} | {resume}")
    out = os.environ.get("GITHUB_OUTPUT")
    if out:
        with open(out, "a", encoding="utf-8") as f:
            f.write(f"stale={'true' if stale else 'false'}\n")
            f.write(f"resume={resume}\n")


if __name__ == "__main__":
    main()

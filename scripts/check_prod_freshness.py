#!/usr/bin/env python3
"""Garde de fraîcheur EXTERNE : la Une servie en prod a-t-elle vieilli ?

POURQUOI UNE SECONDE ALARME. `check_freshness.py` (vitrine#412) existe déjà,
mais c'est un STEP de `refresh-data.yml` : il ne mesure rien quand le workflow
ne tourne pas. C'est exactement ce qui s'est produit deux fois en dix jours —
gel du 21 au 23 août (vitrine#570) et du 28 au 30 août 2026 — pendant lesquels
l'alarme est restée muette parce qu'elle était PASSAGÈRE du véhicule qu'elle
devait surveiller. Une alarme qui s'éteint avec la panne n'est pas une alarme.

CE QU'ON MESURE, ET D'OÙ. Ce script ne lit rien du dépôt et n'ouvre aucune
session AWS : il interroge le SITE DÉPLOYÉ, de l'extérieur, sur deux fichiers
déjà publics — donc sur la vérité que voit un visiteur, pas sur l'état interne
d'un maillon. C'est la différence qui compte : le 22-23 août, le Worker
synchronisait Athena → Neon « sans faute » (15 tables fraîches) pendant que la
prod servait une Une vieille de deux jours. Une sonde sur la santé du Worker
aurait répondu « tout va bien ». Celle-ci non.

  1. /data/hero-selection.json — le verdict de Une déjà affiché en page
     d'accueil (conservé par la liste blanche de postbuild.mjs). Il porte le
     bloc `date_utc` + `time_interval_utc` : c'est LE critère d'alarme.
  2. /build-id.json — l'identifiant de build (`builtAt`), servi en no-store
     pour la sonde ActualisationAuto. DIAGNOSTIC seulement : il dit si le site
     a cessé de se reconstruire, ou s'il se reconstruit avec de vieilles
     données. Deux pannes différentes, deux remèdes différents.

SEUIL. Un bloc de 4 h est publié ~1 h après sa fin et reste affiché jusqu'à
l'édition suivante : l'âge de sa FIN oscille donc NORMALEMENT entre ~1 h et
~5 h. Une édition manquée le porte à ~9 h. Le seuil est à 7 h — au-dessus du
maximum normal avec deux heures de marge, sous le plancher d'une édition
manquée. C'est le SEUL seuil depuis #672 : scripts/check_freshness.py (#412,
mesuré au fetch) l'a repris à 7 h et ne parle plus à Slack, seulement à
Healthchecks. Cette alarme-ci ouvre une issue, elle doit se taire tant qu'il
n'y a pas de quoi réveiller quelqu'un.

Comme #412 : une réponse absente, vide ou illisible est traitée comme PÉRIMÉE,
jamais comme une erreur de script — sinon l'alerte ne partirait pas, ce qui est
précisément le trou qu'on bouche. Sortie toujours 0 ; tout passe par les
outputs.
"""
import datetime
import json
import os
import urllib.request

# Une seule définition de « fin d'un bloc », partagée avec l'alarme #412 —
# y compris son bord legacy « 20-24 ». Deux copies divergeraient un jour.
#
# Deux chemins d'import plutôt qu'une mutation de `sys.path` : ce fichier est
# lancé tantôt comme script (`python scripts/check_prod_freshness.py` — c'est
# alors `scripts/` qui est en tête du chemin, d'où l'import court), tantôt
# importé par les tests (`scripts.check_prod_freshness`, la racine du dépôt
# étant sur le chemin via tests/conftest.py, d'où l'import long).
try:
    from scripts.check_freshness import fin_bloc_utc
except ImportError:
    from check_freshness import fin_bloc_utc

BASE = os.environ.get("VITRINE_BASE_URL", "https://vitrinedemocratique.com")
URL_UNE = f"{BASE}/data/hero-selection.json"
URL_BUILD = f"{BASE}/build-id.json"

SEUIL_H = 7.0  # cf. docstring : normal ≤ 5 h, édition manquée ≈ 9 h
TIMEOUT_S = 20


def _lire_json(url: str) -> dict:
    """GET + JSON, sans cache. Toute erreur remonte telle quelle à l'appelant."""
    req = urllib.request.Request(
        url,
        headers={
            # Le CDN sert build-id.json en no-store, mais hero-selection.json
            # est cacheable : on demande explicitement l'original, sinon on
            # mesurerait l'âge d'une copie de bord au lieu de celui du build.
            "Cache-Control": "no-cache",
            "Pragma": "no-cache",
            "User-Agent": "vitrine-garde-fraicheur",
        },
    )
    with urllib.request.urlopen(req, timeout=TIMEOUT_S) as r:
        return json.loads(r.read().decode("utf-8"))


def age_h(instant: datetime.datetime) -> float:
    return (
        datetime.datetime.now(datetime.timezone.utc) - instant
    ).total_seconds() / 3600


def age_du_build() -> tuple[float | None, str]:
    """(âge en h, mention lisible). None quand la sonde elle-même a échoué."""
    try:
        built = _lire_json(URL_BUILD)["builtAt"]
        a = age_h(
            datetime.datetime.fromisoformat(built.replace("Z", "+00:00"))
        )
        return a, f"dernier build il y a {a:.1f} h"
    except Exception as e:
        return None, f"âge du build inconnu ({type(e).__name__})"


def diagnostiquer(build_age: float | None) -> str:
    """Oriente vers le bon remède : ça ne rebâtit plus, ou ça rebâtit du vieux."""
    if build_age is None:
        return (
            "sonde de build muette — vérifier d'abord que le site répond "
            "(https://vitrinedemocratique.com/build-id.json)"
        )
    if build_age > SEUIL_H:
        return (
            "le site NE SE RECONSTRUIT PLUS (cf. vitrine#570) — Deploy Hooks "
            "du Worker retenus (règle du tout ou rien : une seule table en "
            "échec les bloque) ou intégration Git de Cloudflare Pages coupée. "
            "Remède manuel : `gh workflow run refresh-data.yml --ref main` "
            "puis `gh workflow run deploy-prod.yml --ref prod`"
        )
    return (
        "le site SE RECONSTRUIT mais avec des données en retard — la panne "
        "est en amont, dans la cascade AWS. Diagnostic : skill "
        "diagnostic-donnees-perimees ; remède : skill rattrapage-radar-data-prep"
    )


def mesurer() -> tuple[bool, str, str]:
    """(stale, resume, diagnostic) — toute erreur de lecture = périmé."""
    build_age, mention_build = age_du_build()
    try:
        une = _lire_json(URL_UNE)
        fin = fin_bloc_utc(une["date_utc"], une["time_interval_utc"])
        bloc = f"{une['date_utc']} {une['time_interval_utc']} UTC"
    except Exception as e:
        return (
            True,
            f"{URL_UNE} injoignable, vide ou illisible ({type(e).__name__}: {e}) "
            f"— {mention_build}",
            diagnostiquer(build_age),
        )

    a = age_h(fin)
    if a > SEUIL_H:
        return (
            True,
            f"la prod sert le bloc {bloc}, terminé il y a {a:.1f} h "
            f"(seuil {SEUIL_H:.0f} h ; normal ≤ 5 h) — {mention_build}",
            diagnostiquer(build_age),
        )
    return (
        False,
        f"Fraîcheur OK : bloc {bloc}, terminé il y a {a:.1f} h — {mention_build}",
        "",
    )


def main() -> None:
    stale, resume, diagnostic = mesurer()
    print(f"stale={stale} | {resume}")
    if diagnostic:
        print(f"diagnostic | {diagnostic}")
    out = os.environ.get("GITHUB_OUTPUT")
    if out:
        with open(out, "a", encoding="utf-8") as f:
            f.write(f"stale={'true' if stale else 'false'}\n")
            f.write(f"resume={resume}\n")
            f.write(f"diagnostic={diagnostic}\n")


if __name__ == "__main__":
    main()

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
  3. Les passes de `refresh-data.yml` depuis la fin du bloc servi (API
     Actions). DIAGNOSTIC seulement, consulté quand la prod est périmée. Sans
     lui, la garde accusait « la cascade AWS » pour des pannes qui étaient
     dans GitHub Actions : run annulé au plafond (nuits du 15 au 28-10), commit
     refusé (04-11), grille du cron restée à l'heure d'été (01→04-11).

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
import urllib.parse
import urllib.request
from zoneinfo import ZoneInfo

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

REPO = os.environ.get("GITHUB_REPOSITORY", "ellipse-science/vitrine-showcase.github.io")
API = f"https://api.github.com/repos/{REPO}/actions"
PAGE_FILET = f"https://github.com/{REPO}/actions/workflows/refresh-data.yml"
ECHECS = {"failure", "cancelled", "timed_out", "startup_failure"}
MONTREAL = ZoneInfo("America/Montreal")
# Un bloc qui finit à H:00 sort de la cascade AWS vers H:47 ; les passes de
# refresh-data sont calées à :53 pour le prendre (calage du 10-09).
CASCADE = datetime.timedelta(hours=4, minutes=47)
_PAS_CONSULTE = object()


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


def _lire_api(url: str) -> dict:
    """GET sur l'API GitHub, avec le jeton du job s'il y en a un."""
    entetes = {
        "Accept": "application/vnd.github+json",
        "User-Agent": "vitrine-garde-fraicheur",
    }
    jeton = os.environ.get("GH_TOKEN") or os.environ.get("GITHUB_TOKEN")
    if jeton:
        entetes["Authorization"] = f"Bearer {jeton}"
    req = urllib.request.Request(url, headers=entetes)
    with urllib.request.urlopen(req, timeout=TIMEOUT_S) as r:
        return json.loads(r.read().decode("utf-8"))


def _instant(iso: str) -> datetime.datetime:
    return datetime.datetime.fromisoformat(iso.replace("Z", "+00:00"))


def _heure(instant: datetime.datetime) -> str:
    """« 22h55 », heure de Montréal."""
    t = instant.astimezone(MONTREAL)
    return f"{t.hour}h{t.minute:02d}"


def _issue_de_la_passe(run: dict) -> tuple[str, str]:
    """(« livree » | « sautee » | « ratee », détail) d'une passe terminée.

    On juge le job `refresh`, pas le run : depuis vitrine#971, un échec du job
    `portraits` rend le run rouge alors que l'édition est partie, et depuis
    vitrine#982 la passe de la grille hors saison finit « success » sans rien
    livrer (job `refresh` sauté).
    """
    try:
        jobs = {j["name"]: j for j in _lire_api(f"{API}/runs/{run['id']}/jobs")["jobs"]}
    except Exception:
        jobs = {}
    refresh = jobs.get("refresh")
    if refresh is None:  # jobs illisibles : on s'en tient au run
        if run.get("conclusion") in ECHECS:
            return "ratee", f"a fini « {run['conclusion']} »"
        return "livree", ""
    conclusion = refresh.get("conclusion")
    if conclusion == "success":
        return "livree", ""
    if conclusion == "skipped":
        if jobs.get("saison", {}).get("conclusion") == "success":
            return "sautee", ""
        return "ratee", "n'a rien livré : la garde de saison a échoué"
    if conclusion == "cancelled":
        return "ratee", "a été annulée (plafond de durée ou annulation manuelle)"
    etape = next(
        (s["name"] for s in refresh.get("steps", []) if s.get("conclusion") == "failure"),
        None,
    )
    if etape:
        return "ratee", f"a échoué à l'étape « {etape} »"
    return "ratee", f"a fini « {conclusion} »"


def etat_du_filet(
    fin: datetime.datetime, jusqua: datetime.datetime | None = None
) -> tuple[str, str] | None:
    """Ce qu'ont fait les passes de refresh-data depuis la fin du bloc servi.

    (« ratee » | « absente » | « decalee » | « livree », message), ou None si
    l'API n'a pas répondu. `jusqua` borne la fenêtre pour rejouer un incident.
    """
    f = "%Y-%m-%dT%H:%M:%SZ"
    borne = f">={fin:{f}}" if jusqua is None else f"{fin:{f}}..{jusqua:{f}}"
    try:
        runs = _lire_api(
            f"{API}/workflows/refresh-data.yml/runs?per_page=30"
            f"&created={urllib.parse.quote(borne)}"
        )["workflow_runs"]
    except Exception:
        return None
    for run in runs:  # l'API rend les plus récents d'abord
        if run.get("status") != "completed":
            continue
        issue, detail = _issue_de_la_passe(run)
        if issue == "sautee":
            continue
        heure = _heure(_instant(run["created_at"]))
        if issue == "ratee":
            return "ratee", (
                f"la passe refresh-data de {heure} {detail} : l'édition suivante "
                "n'a jamais été poussée. La panne est dans GitHub Actions, PAS "
                f"dans la cascade AWS. Journal : {run['html_url']} ; relance : "
                "`gh workflow run refresh-data.yml --ref develop`"
            )
        # La dernière passe a livré, et la prod est pourtant vieille. Si elle
        # est partie AVANT que le bloc suivant sorte de la cascade, elle ne
        # pouvait pas l'avoir : c'est l'horaire du filet, pas AWS.
        pret = fin + CASCADE
        if _instant(run["created_at"]) < pret:
            return "decalee", (
                f"la dernière passe refresh-data ({heure}) est partie AVANT que "
                f"le bloc suivant sorte de la cascade AWS (~{_heure(pret)}), et "
                "aucune ne l'a suivie : la grille du cron est décalée (changement "
                f"d'heure ?) ou une passe a sauté. Passes : {PAGE_FILET}"
            )
        return "livree", f"dernière passe refresh-data livrée à {heure} ({run['html_url']})"
    en_cours = [r for r in runs if r.get("status") != "completed"]
    if en_cours:
        r = en_cours[-1]
        return "absente", (
            f"aucune passe refresh-data terminée depuis la fin du bloc servi "
            f"({_heure(fin)}) ; un run est « {r.get('status')} » depuis "
            f"{_heure(_instant(r['created_at']))}, bloqué ? {r['html_url']}"
        )
    return "absente", (
        f"aucune passe refresh-data depuis la fin du bloc servi ({_heure(fin)}) : "
        f"le cron GitHub n'a pas tiré, ou le workflow est désactivé. {PAGE_FILET}"
    )


def diagnostiquer(build_age: float | None, filet=_PAS_CONSULTE) -> str:
    """Oriente vers le bon remède : ça ne rebâtit plus, ou ça rebâtit du vieux.

    Les passes de refresh-data priment sur l'âge du build : elles sont le
    premier maillon, et c'est leur panne que la garde prenait pour AWS.
    """
    if build_age is None:
        return (
            "sonde de build muette — vérifier d'abord que le site répond "
            "(https://vitrinedemocratique.com/build-id.json)"
        )
    if filet is not _PAS_CONSULTE and filet and filet[0] != "livree":
        return filet[1]
    if build_age > SEUIL_H:
        return (
            "le site NE SE RECONSTRUIT PLUS (cf. vitrine#570) — Deploy Hooks "
            "du Worker retenus (règle du tout ou rien : une seule table en "
            "échec les bloque) ou intégration Git de Cloudflare Pages coupée. "
            "Remède manuel : `gh workflow run refresh-data.yml --ref main` "
            "puis `gh workflow run deploy-prod.yml --ref prod`"
        )
    amont = (
        "le site SE RECONSTRUIT mais avec des données en retard — la panne "
        "est en amont, dans la cascade AWS. Diagnostic : skill "
        "diagnostic-donnees-perimees ; remède : skill rattrapage-radar-data-prep"
    )
    if filet is _PAS_CONSULTE:
        return amont
    if filet is None:
        return (
            f"{amont} (passes refresh-data illisibles : lire d'abord "
            "`gh run list -w refresh-data.yml`)"
        )
    return f"{amont} — {filet[1]}"


def mesurer() -> tuple[bool, str, str]:
    """(stale, resume, diagnostic) — toute erreur de lecture = périmé."""
    build_age, mention_build = age_du_build()
    try:
        une = _lire_json(URL_UNE)
        # Le bloc mesuré est celui du JEU servi (`latest_block`, depuis le
        # 2 septembre 2026), pas celui de l'histoire de tête : une histoire
        # dominante depuis la veille garde le bloc de sa dernière occurrence, et
        # la sonde criait « 22 h de retard » sur un site à jour. Repli sur le
        # bloc de la Une tant qu'un build antérieur ne porte pas le champ.
        ref = une.get("latest_block") or une
        fin = fin_bloc_utc(ref["date_utc"], ref["time_interval_utc"])
        bloc = f"{ref['date_utc']} {ref['time_interval_utc']} UTC"
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
            diagnostiquer(build_age, etat_du_filet(fin)),
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

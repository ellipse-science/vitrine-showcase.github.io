"""Calibration de la garde de fraîcheur externe (scripts/check_prod_freshness.py).

On ne teste pas le réseau : on remplace `_lire_json` et on vérifie les trois
choses qui décident si quelqu'un est réveillé ou non — le seuil, le silence
traité comme une panne, et l'orientation du diagnostic.
"""
import datetime

from scripts import check_prod_freshness as garde


def _un_bloc_termine_il_y_a(heures: float) -> dict:
    """Verdict de Une dont le bloc de 4 h s'est terminé il y a `heures`."""
    fin = datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(
        hours=heures
    )
    fin = fin.replace(minute=0, second=0, microsecond=0)
    debut = fin - datetime.timedelta(hours=4)
    return {
        "date_utc": debut.strftime("%Y-%m-%d"),
        "time_interval_utc": f"{debut.hour}-{fin.hour}",
    }


def _il_y_a(heures: float) -> str:
    return (
        datetime.datetime.now(datetime.timezone.utc)
        - datetime.timedelta(hours=heures)
    ).isoformat().replace("+00:00", "Z")


def _passe(id_, il_y_a_h, refresh="success", saison="success", etape=None):
    """Une passe de refresh-data terminée, telle que la rend l'API Actions."""
    run = {
        "id": id_,
        "status": "completed",
        "conclusion": "failure" if refresh in garde.ECHECS else "success",
        "created_at": _il_y_a(il_y_a_h),
        "html_url": f"https://github.com/x/y/actions/runs/{id_}",
    }
    pas = [{"name": etape, "conclusion": "failure"}] if etape else []
    jobs = [
        {"name": "saison", "conclusion": saison},
        {"name": "refresh", "conclusion": refresh, "steps": pas},
    ]
    return run, jobs


def _brancher(monkeypatch, une, build_age_h=1.0, passes=None):
    """`passes` : liste de _passe(), plus récente d'abord ; None = API muette.

    Par défaut, une passe livrée il y a 1 h : le filet a fait son travail, ce
    qui laisse le diagnostic d'origine (build vieux / cascade AWS) décider.
    """
    builtAt = _il_y_a(build_age_h)

    def faux(url):
        if url == garde.URL_BUILD:
            return {"builtAt": builtAt}
        if une is None:
            raise OSError("injoignable")
        return une

    if passes is None:
        passes = [_passe(1, 1.0)]
    jobs_par_run = {} if passes == "muette" else {run["id"]: jobs for run, jobs in passes}

    def faux_api(url):
        if passes == "muette":
            raise OSError("API muette")
        if "/workflows/refresh-data.yml/runs" in url:
            return {"workflow_runs": [run for run, _ in passes]}
        return {"jobs": jobs_par_run[int(url.split("/runs/")[1].split("/")[0])]}

    monkeypatch.setattr(garde, "_lire_json", faux)
    monkeypatch.setattr(garde, "_lire_api", faux_api)


def test_bloc_de_cinq_heures_est_normal(monkeypatch):
    """Le maximum du cycle normal (~5 h) ne doit réveiller personne."""
    _brancher(monkeypatch, _un_bloc_termine_il_y_a(5.0))
    stale, resume, _ = garde.mesurer()
    assert stale is False
    assert "Fraîcheur OK" in resume


def test_edition_manquee_declenche(monkeypatch):
    """Une édition sautée porte le bloc à ~9 h : c'est ce qu'on veut attraper."""
    _brancher(monkeypatch, _un_bloc_termine_il_y_a(9.0))
    stale, resume, _ = garde.mesurer()
    assert stale is True
    assert "seuil 7 h" in resume


def test_gel_de_deux_jours_declenche(monkeypatch):
    """Le scénario vécu (vitrine#570) : la prod servait un bloc vieux de ~49 h."""
    _brancher(monkeypatch, _un_bloc_termine_il_y_a(49.0))
    stale, _, _ = garde.mesurer()
    assert stale is True


def test_sonde_muette_vaut_panne(monkeypatch):
    """Un site injoignable est le cas GRAVE — jamais une erreur de script."""
    _brancher(monkeypatch, None)
    stale, resume, _ = garde.mesurer()
    assert stale is True
    assert "injoignable" in resume


def test_diagnostic_distingue_les_deux_pannes(monkeypatch):
    """Build frais = la cascade AWS ; build vieux = plus rien ne rebâtit."""
    _brancher(monkeypatch, _un_bloc_termine_il_y_a(49.0), build_age_h=1.0)
    _, _, amont = garde.mesurer()
    assert "cascade AWS" in amont

    _brancher(monkeypatch, _un_bloc_termine_il_y_a(49.0), build_age_h=49.0)
    _, _, fige = garde.mesurer()
    assert "NE SE RECONSTRUIT PLUS" in fige


# ─── Les passes de refresh-data avant la cascade AWS ─────────────────────────
# Trois fois (10-10, 28-10, 04-11), la garde a accusé AWS pour une panne qui
# était dans GitHub Actions. Ces cas rejouent la forme de chacune.


def test_passe_annulee_accuse_github_pas_aws(monkeypatch):
    """Nuits du 15 au 28-10 : la passe de minuit tuée au plafond de 25 min."""
    _brancher(
        monkeypatch,
        _un_bloc_termine_il_y_a(7.5),
        passes=[_passe(9, 2.6, refresh="cancelled"), _passe(8, 6.6)],
    )
    _, _, diag = garde.mesurer()
    assert "annulée" in diag and "runs/9" in diag
    assert "PAS dans la cascade AWS" in diag


def test_commit_refuse_nomme_l_etape(monkeypatch):
    """04-11 : la passe finit, mais `git pull --rebase` refuse l'arbre sale."""
    _brancher(
        monkeypatch,
        _un_bloc_termine_il_y_a(8.0),
        passes=[_passe(9, 3.4, refresh="failure", etape="Commit updated data files")],
    )
    _, _, diag = garde.mesurer()
    assert "« Commit updated data files »" in diag


def test_passe_sautee_hors_saison_est_ignoree(monkeypatch):
    """La grille hors saison finit « success » sans rien livrer : on regarde avant."""
    _brancher(
        monkeypatch,
        _un_bloc_termine_il_y_a(7.5),
        passes=[_passe(10, 1.6, refresh="skipped"), _passe(9, 2.6, refresh="cancelled")],
    )
    _, _, diag = garde.mesurer()
    assert "runs/9" in diag


def test_portraits_rouges_mais_edition_livree(monkeypatch):
    """Depuis #971, seul le job `refresh` dit si l'édition est partie."""
    run, jobs = _passe(9, 2.0)
    run["conclusion"] = "failure"
    jobs.append({"name": "portraits", "conclusion": "failure"})
    _brancher(monkeypatch, _un_bloc_termine_il_y_a(7.5), passes=[(run, jobs)])
    _, _, diag = garde.mesurer()
    assert "cascade AWS" in diag and "livrée" in diag


def test_grille_decalee(monkeypatch):
    """01→04-11 : passes réussies, mais parties AVANT la sortie du bloc suivant."""
    # Bloc fini il y a 7,4 h ; la dernière passe a 3,5 h, donc partie 3,9 h
    # après la fin du bloc servi : avant les 4 h 47 de la cascade suivante.
    _brancher(
        monkeypatch,
        _un_bloc_termine_il_y_a(7.4),
        passes=[_passe(9, 3.5), _passe(8, 7.5)],
    )
    _, _, diag = garde.mesurer()
    assert "grille du cron est décalée" in diag
    assert "cascade AWS" not in diag.split("sorte de la")[0]


def test_aucune_passe(monkeypatch):
    _brancher(monkeypatch, _un_bloc_termine_il_y_a(9.0), passes=[])
    _, _, diag = garde.mesurer()
    assert "aucune passe refresh-data" in diag


def test_api_muette_garde_l_ancien_diagnostic(monkeypatch):
    """L'API Actions muette ne doit ni masquer l'alerte ni inventer une cause."""
    _brancher(monkeypatch, _un_bloc_termine_il_y_a(9.0), passes="muette")
    stale, _, diag = garde.mesurer()
    assert stale is True
    assert "cascade AWS" in diag and "illisibles" in diag

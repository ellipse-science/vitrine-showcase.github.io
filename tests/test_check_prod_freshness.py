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


def _brancher(monkeypatch, une, build_age_h=1.0):
    builtAt = (
        datetime.datetime.now(datetime.timezone.utc)
        - datetime.timedelta(hours=build_age_h)
    ).isoformat().replace("+00:00", "Z")

    def faux(url):
        if url == garde.URL_BUILD:
            return {"builtAt": builtAt}
        if une is None:
            raise OSError("injoignable")
        return une

    monkeypatch.setattr(garde, "_lire_json", faux)


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

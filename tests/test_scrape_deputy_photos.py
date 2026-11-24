"""Portraits des député·es qui ne sont plus dans l'index de l'ANQ (issue #1028).

Le 15-10-2026, l'index de l'ANQ est passé à la 44e législature. Le module
affiche toujours les données de la 43e. Le scraper ne récupérait que les
membres de l'index courant : 97 des 129 cartes ont perdu leur portrait.

On ne teste pas le réseau. On teste `planifier`, qui décide quels portraits
récupérer et où les ranger, à partir de quatre sources :
- l'index courant de l'ANQ ;
- l'index de la veille (`public/images/deputes/index.json`) ;
- l'historique tenu à la main (`scripts/deputy_portrait_history.json`) ;
- les `deputy_id` affichés par le module (les données Agora).
"""
import json

from scripts import scrape_deputy_photos as scraper

PROFIL = "https://www.assnat.qc.ca/fr/deputes/{}/index.html"


def _courant(deputy_id, nom, circonscription, parti="Parti québécois"):
    """Une ligne de l'index courant de l'ANQ, telle que `main` la construit."""
    return {
        "profil": PROFIL.format(f"x-{deputy_id}"),
        "deputy_id": deputy_id,
        "nom_index": nom,
        "circonscription": circonscription,
        "parti": parti,
    }


def _veille(deputy_id, nom, circonscription, parti="Coalition avenir Québec"):
    """Une entrée de l'index.json écrit la veille par le scraper."""
    asset = scraper.slug(circonscription)
    return {
        "deputy_id": deputy_id,
        "circonscription": circonscription,
        "circonscription_slug": asset,
        "asset_slug": asset,
        "nom": nom,
        "parti": parti,
        "fichier": f"/images/deputes/{asset}.jpg",
        "profil": PROFIL.format(f"y-{deputy_id}"),
    }


# Abitibi-Est change de titulaire : la sortante (43e) et le nouveau (44e).
SORTANTE = _veille("17000", "Députée Sortante", "Abitibi-Est")
NOUVEAU = _courant("20319", "Stéphane Tremblay", "Abitibi-Est")
# Acadie garde son député, réélu.
REELU_VEILLE = _veille("15000", "Député Réélu", "Acadie", parti="Parti libéral du Québec")
REELU = _courant("15000", "Député Réélu", "Acadie", parti="Parti libéral du Québec")


def _plan(courant, veille=(), historique=(), affiches=()):
    return scraper.planifier(
        courant,
        {str(v["deputy_id"]): v for v in veille},
        list(historique),
        {str(i) for i in affiches},
    )


def _par_id(plan):
    return {str(d["deputy_id"]): d for d in plan.a_recuperer}


def test_un_depute_non_reelu_garde_son_portrait():
    """Le cas de l'issue #1028 : la 43e est affichée, l'index est à la 44e."""
    plan = _plan(
        [NOUVEAU, REELU],
        veille=[SORTANTE, REELU_VEILLE],
        affiches=["17000", "15000"],
    )
    sortante = _par_id(plan)["17000"]
    assert sortante["historique"] is True
    assert sortante["profil"] == SORTANTE["profil"]
    assert sortante["nom_index"] == "Députée Sortante"
    assert sortante["circonscription"] == "Abitibi-Est"
    assert plan.introuvables == set()


def test_le_successeur_n_ecrase_pas_le_portrait_de_la_sortante():
    """Même circonscription, deux visages : deux fichiers distincts.

    Les photos des membres actuels sont rangées par circonscription. Si la
    sortante restait sur `abitibi-est.jpg`, la photo du successeur
    l'écraserait et sa carte afficherait le mauvais visage.
    """
    plan = _plan([NOUVEAU], veille=[SORTANTE], affiches=["17000"])
    fichiers = {i: scraper.asset_slug(d) for i, d in _par_id(plan).items()}
    assert fichiers == {"20319": "abitibi-est", "17000": "historique/17000"}


def test_un_depute_reelu_n_est_recupere_qu_une_fois_comme_membre_actuel():
    plan = _plan([REELU], veille=[REELU_VEILLE], affiches=["15000"])
    assert [d["deputy_id"] for d in plan.a_recuperer] == ["15000"]
    assert plan.a_recuperer[0]["historique"] is False


def test_l_historique_tenu_a_la_main_reste_lu():
    fitzgibbon = {
        "deputy_id": "17897",
        "profil": PROFIL.format("fitzgibbon-pierre-17897"),
        "nom_index": "Pierre Fitzgibbon",
        "circonscription": "Terrebonne",
        "parti": "Coalition avenir Québec",
    }
    plan = _plan([NOUVEAU], historique=[fitzgibbon], affiches=["17897"])
    assert _par_id(plan)["17897"]["historique"] is True


def test_un_depute_qui_n_est_plus_affiche_n_est_pas_garde():
    """La veille ne s'accumule pas : on ne garde que ce que le module affiche."""
    plan = _plan([NOUVEAU], veille=[SORTANTE], affiches=[])
    assert "17000" not in _par_id(plan)


def test_un_depute_affiche_introuvable_est_signale():
    """Sans profil connu nulle part, on ne devine pas : on le signale (alerte)."""
    plan = _plan([NOUVEAU], affiches=["99999"])
    assert "99999" not in _par_id(plan)
    assert plan.introuvables == {"99999"}


def test_les_ids_affiches_viennent_des_donnees_agora(tmp_path):
    agora = tmp_path / "agora_decideurs_qc_deputes.json"
    agora.write_text(json.dumps([
        {"period_type": "legislature", "deputy_id": 17000},
        {"period_type": "session", "deputy_id": "17000"},
        {"period_type": "legislature", "deputy_id": "15000"},
        {"period_type": "legislature", "deputy_id": None},
    ]), encoding="utf-8")
    assert scraper.ids_affiches(agora) == {"17000", "15000"}


def test_un_echec_ne_ressort_pas_la_photo_du_successeur():
    """Une fiche de sortante qui échoue ne doit pas garder `abitibi-est.jpg`.

    Ce fichier vient d'être réécrit avec la photo du successeur. Garder
    l'entrée de la veille afficherait le mauvais visage sur la carte.
    """
    sortante = _par_id(_plan([NOUVEAU], veille=[SORTANTE], affiches=["17000"]))["17000"]
    existe = lambda _fichier: True
    assert scraper.entree_de_secours(sortante, SORTANTE, existe) is None

    # Pour un membre actuel, la photo de la veille reste un bon secours.
    reelu = _par_id(_plan([REELU], veille=[REELU_VEILLE], affiches=["15000"]))["15000"]
    assert scraper.entree_de_secours(reelu, REELU_VEILLE, existe) == REELU_VEILLE
    assert scraper.entree_de_secours(reelu, REELU_VEILLE, lambda _f: False) is None


def test_une_deputee_reprise_de_la_veille_entre_dans_l_historique():
    """Sinon elle serait oubliée dès le lendemain, avec l'index de la veille."""
    plan = _plan([NOUVEAU], veille=[SORTANTE], affiches=["17000"])
    historique = scraper.completer_historique([], plan)
    assert historique == [{
        "deputy_id": "17000",
        "profil": SORTANTE["profil"],
        "nom_index": "Députée Sortante",
        "circonscription": "Abitibi-Est",
        "parti": "Coalition avenir Québec",
    }]
    # Idempotent : la relancer n'ajoute pas de doublon.
    assert scraper.completer_historique(historique, plan) == historique

#!/usr/bin/env python3
"""Télécharge les portraits officiels des députés de l'Assemblée nationale.

Source : https://www.assnat.qc.ca/fr/deputes/
Licence : l'ANQ autorise la reproduction sans frais pour un usage non
commercial, à condition de ne pas porter atteinte à la réputation des
personnes et d'indiquer la source « Assemblée nationale du Québec ».
Voir https://www.assnat.qc.ca/fr/propos-site/droits-propriete-intellectuelle.html

Écrit public/images/deputes/<circonscription>.jpg pour les membres actuels et
public/images/deputes/historique/<id>.jpg pour les anciens membres nécessaires
aux périodes longues. L'index JSON porte,
pour chaque député, le nom TEL QUE L'ANQ L'ÉCRIT (accents et traits d'union
compris). Ce nom est la seule source fiable de graphie : le référentiel de
pplmatch stocke « louischarles thouin » là où la transcription et l'ANQ
écrivent « Louis-Charles Thouin ».

L'appariement avec nos données se fait par CIRCONSCRIPTION, pas par nom :
les ridings sont uniques et stables, les graphies de noms ne le sont pas.

Usage : python3 scripts/scrape_deputy_photos.py [--dry-run]
"""
import json, re, sys, time, unicodedata, urllib.request
from dataclasses import dataclass, field
from html import unescape
from pathlib import Path

BASE = "https://www.assnat.qc.ca"
INDEX = f"{BASE}/fr/deputes/index.html"
UA = "VitrineDemocratique/1.0 (projet academique CAPP-CLESSN; +https://github.com/ellipse-science)"
OUT_DIR = Path("public/images/deputes")
OUT_INDEX = Path("public/images/deputes/index.json")
HISTORY_INDEX = Path("scripts/deputy_portrait_history.json")
DELAY = 0.7  # politesse : ~1 requête/s vers un serveur public

def get(url, binary=False):
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=45) as r:
        raw = r.read()
    return raw if binary else raw.decode("utf-8", "replace")

def slug(s):
    s = unicodedata.normalize("NFD", s.lower())
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    return re.sub(r"-+", "-", re.sub(r"[^a-z0-9]+", "-", s)).strip("-")

def profile_id(url):
    match = re.search(r"-(\d+)/index\.html$", url)
    return match.group(1) if match else None

ROW = re.compile(
    r'<a href="(/fr/deputes/[a-z0-9-]+-\d+/index\.html)">(.*?)</a>\s*</td>\s*'
    r'<td>\s*(.*?)\s*</td>\s*<td>\s*(.*?)\s*</td>', re.S)

def clean(s):
    return re.sub(r"\s+", " ", unescape(s).replace("\xa0", " ")).strip()

# ---------------------------------------------------------------------------
# Le plan : de qui faut-il un portrait, et où le ranger ? (issue #1028)
#
# La question n'est pas « qui siège aujourd'hui ? » mais « de qui le site
# affiche-t-il une carte ? ». Le 15-10-2026, l'index de l'ANQ est passé à la
# 44e législature alors que le module affichait encore la 43e : en ne
# récupérant que l'index courant, le script a retiré leur portrait à 97 cartes
# sur 129.
#
# Les fonctions de ce bloc sont pures (ni réseau ni disque) : `main` exécute le
# plan, les tests vérifient les décisions (tests/test_scrape_deputy_photos.py).
# ---------------------------------------------------------------------------

AGORA_DEPUTES = Path("public/data/agora/agora_decideurs_qc_deputes.json")
HISTORY_FIELDS = ("deputy_id", "profil", "nom_index", "circonscription", "parti")


@dataclass
class Plan:
    a_recuperer: list = field(default_factory=list)
    # Député·es affiché·es dont on ne connaît le profil ANQ nulle part. On ne
    # devine pas une adresse : on les signale.
    introuvables: set = field(default_factory=set)


def asset_slug(d):
    """Où ranger la photo. Par circonscription pour les membres actuels, par
    identifiant pour les ancien·nes : sinon le successeur, rangé sous la même
    circonscription, écraserait la photo et la carte montrerait son visage."""
    if d["historique"]:
        return f"historique/{d['deputy_id']}"
    return slug(d["circonscription"])


def ids_affiches(path):
    """Les deputy_id pour lesquels le module affiche une carte."""
    rows = json.loads(Path(path).read_text(encoding="utf-8"))
    return {str(r["deputy_id"]) for r in rows
            if r.get("deputy_id") not in (None, "")}


def planifier(courant, veille, historique, affiches):
    """Décide quels portraits récupérer.

    courant    : les lignes de l'index de l'ANQ (membres actuels) ;
    veille     : {deputy_id: entrée} de l'index.json écrit au passage précédent ;
    historique : deputy_portrait_history.json (ancien·nes membres à garder) ;
    affiches   : les deputy_id que le module affiche.
    """
    plan = Plan()
    connus = set()

    def ajouter(d, historique_, origine):
        i = str(d["deputy_id"])
        connus.add(i)
        plan.a_recuperer.append({**{k: d[k] for k in HISTORY_FIELDS},
                                 "deputy_id": i, "historique": historique_,
                                 "origine": origine})

    for d in courant:
        ajouter(d, False, "index")
    for d in historique:
        if str(d["deputy_id"]) not in connus:
            ajouter(d, True, "historique")
    # Un·e député·e affiché·e qui n'est plus dans l'index : son profil vient de
    # la veille, où il figurait encore. `main` l'inscrit ensuite dans
    # l'historique, sinon il serait perdu dès le lendemain.
    for i in sorted(affiches - connus):
        ancien = veille.get(i)
        if ancien and ancien.get("profil"):
            ajouter({"deputy_id": i, "profil": ancien["profil"],
                     "nom_index": ancien["nom"],
                     "circonscription": ancien["circonscription"],
                     "parti": ancien["parti"]}, True, "veille")
        else:
            plan.introuvables.add(i)
    return plan


def entree_de_secours(d, ancien, fichier_existe):
    """Sur un échec de téléchargement, l'entrée de la veille peut-elle servir ?

    Seulement si elle pointe vers le fichier que le plan prévoit. Celle d'un·e
    sortant·e pointe vers <circonscription>.jpg, que la photo du successeur
    vient d'écraser : la garder afficherait le mauvais visage.
    """
    if not ancien or ancien.get("asset_slug") != asset_slug(d):
        return None
    return ancien if fichier_existe(f"{ancien['asset_slug']}.jpg") else None


def completer_historique(historique, plan):
    """L'historique, augmenté des député·es repris·es de la veille."""
    deja = {str(d["deputy_id"]) for d in historique}
    nouveaux = [{k: d[k] for k in HISTORY_FIELDS} for d in plan.a_recuperer
                if d["origine"] == "veille" and d["deputy_id"] not in deja]
    return list(historique) + nouveaux


def lire_json(path, defaut):
    try:
        return json.loads(Path(path).read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return defaut


def main():
    dry = "--dry-run" in sys.argv
    print("Index des députés…")
    rows = ROW.findall(get(INDEX))
    # Page d'index illisible (site en panne, gabarit changé) : on n'écrit RIEN.
    # Sans ce garde-fou, l'index serait réécrit vide et toutes les cartes
    # perdraient leur portrait jusqu'au passage suivant.
    if not rows:
        sys.exit("Aucun député lu sur la page d'index : l'index existant est conservé.")
    seen, courant = set(), []
    for path, name, riding, party in rows:
        if path in seen:
            continue
        seen.add(path)
        nom = clean(name)
        if "," in nom:  # « Arseneau, Joël » -> « Joël Arseneau »
            fam, _, pre = nom.partition(",")
            nom = f"{pre.strip()} {fam.strip()}".strip()
        profile = BASE + path
        courant.append({"profil": profile, "deputy_id": profile_id(profile),
                        "nom_index": nom, "circonscription": clean(riding),
                        "parti": clean(party)})
    # L'INDEX DE LA VEILLE (3 oct. 2026). Il sert à deux choses : retrouver le
    # profil d'un·e député·e sorti·e de l'index, et garder une entrée quand une
    # fiche échoue passagèrement (le 3 oct., 8 élus sur 129 avaient perdu leur
    # portrait pour une erreur de l'ANQ alors que la photo était dans le dépôt).
    veille = {str(x["deputy_id"]): x
              for x in lire_json(OUT_INDEX, {}).get("deputes", [])}
    historique = lire_json(HISTORY_INDEX, [])
    affiches = ids_affiches(AGORA_DEPUTES) if AGORA_DEPUTES.exists() else set()
    plan = planifier(courant, veille, historique, affiches)
    deputies = plan.a_recuperer
    repris = [d for d in deputies if d["origine"] == "veille"]
    print(f"  {len(courant)} dans l'index, {len(deputies)} portraits à récupérer"
          f" (dont {len(repris)} repris de la veille), {len(affiches)} affichés")
    for i in sorted(plan.introuvables):
        print(f"  ⚠ deputy_id {i} affiché mais sans profil ANQ connu : carte sans portrait")
    if dry:
        for d in deputies[:5] + repris[:5]:
            print("  ", d["nom_index"], "|", d["circonscription"], "|", d["parti"],
                  "|", asset_slug(d))
        return

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    IMG = re.compile(r'<img[^>]*class="photoDepute"[^>]*>')
    SRC = re.compile(r'src="([^"]+)"')
    ALT = re.compile(r'alt="([^"]*)"')
    out, echecs, conserves = [], [], []
    for i, d in enumerate(deputies, 1):
        try:
            page = get(d["profil"])
            tag = IMG.search(page)
            if not tag:
                raise ValueError("pas de portrait")
            src = unescape(SRC.search(tag.group(0)).group(1))
            # Certaines fiches portent un alt="" vide (vu sur Saint-Henri–Sainte-Anne).
            # On teste le CONTENU, pas la présence de l'attribut, sinon le nom
            # de la page d'index — parfaitement bon — se fait écraser par du vide.
            m_alt = ALT.search(tag.group(0))
            alt = clean(m_alt.group(1)) if m_alt else ""
            if not alt:
                alt = d["nom_index"]
            fichier = f"{asset_slug(d)}.jpg"
            (OUT_DIR / fichier).parent.mkdir(parents=True, exist_ok=True)
            (OUT_DIR / fichier).write_bytes(get(src, binary=True))
            out.append({"deputy_id": str(d["deputy_id"]),
                        "circonscription": d["circonscription"],
                        "circonscription_slug": slug(d["circonscription"]),
                        "asset_slug": asset_slug(d),
                        "nom": alt, "parti": d["parti"],
                        "fichier": f"/images/deputes/{fichier}", "profil": d["profil"]})
            print(f"  [{i}/{len(deputies)}] {alt} — {d['circonscription']}")
        except Exception as e:
            echecs.append((d["nom_index"], str(e)[:70]))
            ancien = entree_de_secours(d, veille.get(d["deputy_id"]),
                                       lambda f: (OUT_DIR / f).exists())
            if ancien:
                out.append(ancien)
                conserves.append(d["nom_index"])
        time.sleep(DELAY)

    # Les député·es repris·es de la veille entrent dans l'historique, qui est la
    # mémoire durable : dès le passage suivant, l'index de la veille ne les
    # contiendra plus que si leur téléchargement a réussi.
    if repris:
        HISTORY_INDEX.write_text(json.dumps(completer_historique(historique, plan),
                                            ensure_ascii=False, indent=2) + "\n",
                                 encoding="utf-8")

    OUT_INDEX.write_text(json.dumps({
        "source": "Assemblée nationale du Québec",
        "source_url": "https://www.assnat.qc.ca/fr/deputes/",
        "licence": "Reproduction autorisée pour usage non commercial avec mention de la source.",
        "licence_url": "https://www.assnat.qc.ca/fr/propos-site/droits-propriete-intellectuelle.html",
        "recupere_le": time.strftime("%Y-%m-%d"),
        "deputes": sorted(out, key=lambda x: (x["circonscription"], x["deputy_id"])),
    }, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"\n{len(out)} portraits, {len(echecs)} échecs, dont {len(conserves)} gardés de la veille")
    for n, e in echecs:
        print("  échec:", n, "—", e)

if __name__ == "__main__":
    main()

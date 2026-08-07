#!/usr/bin/env python3
"""Télécharge les portraits officiels des députés de l'Assemblée nationale.

Source : https://www.assnat.qc.ca/fr/deputes/
Licence : l'ANQ autorise la reproduction sans frais pour un usage non
commercial, à condition de ne pas porter atteinte à la réputation des
personnes et d'indiquer la source « Assemblée nationale du Québec ».
Voir https://www.assnat.qc.ca/fr/propos-site/droits-propriete-intellectuelle.html

Écrit public/images/deputes/<circonscription>.jpg et un index JSON qui porte,
pour chaque député, le nom TEL QUE L'ANQ L'ÉCRIT (accents et traits d'union
compris). Ce nom est la seule source fiable de graphie : le référentiel de
pplmatch stocke « louischarles thouin » là où la transcription et l'ANQ
écrivent « Louis-Charles Thouin ».

L'appariement avec nos données se fait par CIRCONSCRIPTION, pas par nom :
les ridings sont uniques et stables, les graphies de noms ne le sont pas.

Usage : python3 scripts/scrape_deputy_photos.py [--dry-run]
"""
import json, re, sys, time, unicodedata, urllib.request
from html import unescape
from pathlib import Path

BASE = "https://www.assnat.qc.ca"
INDEX = f"{BASE}/fr/deputes/index.html"
UA = "VitrineDemocratique/1.0 (projet academique CAPP-CLESSN; +https://github.com/ellipse-science)"
OUT_DIR = Path("public/images/deputes")
OUT_INDEX = Path("public/images/deputes/index.json")
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

ROW = re.compile(
    r'<a href="(/fr/deputes/[a-z0-9-]+-\d+/index\.html)">(.*?)</a>\s*</td>\s*'
    r'<td>\s*(.*?)\s*</td>\s*<td>\s*(.*?)\s*</td>', re.S)

def clean(s):
    return re.sub(r"\s+", " ", unescape(s).replace("\xa0", " ")).strip()

def main():
    dry = "--dry-run" in sys.argv
    print("Index des députés…")
    rows = ROW.findall(get(INDEX))
    seen, deputies = set(), []
    for path, name, riding, party in rows:
        if path in seen:
            continue
        seen.add(path)
        nom = clean(name)
        if "," in nom:  # « Arseneau, Joël » -> « Joël Arseneau »
            fam, _, pre = nom.partition(",")
            nom = f"{pre.strip()} {fam.strip()}".strip()
        deputies.append({"profil": BASE + path, "nom_index": nom,
                         "circonscription": clean(riding), "parti": clean(party)})
    print(f"  {len(deputies)} députés")
    if dry:
        for d in deputies[:5]:
            print("  ", d["nom_index"], "|", d["circonscription"], "|", d["parti"])
        return

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    IMG = re.compile(r'<img[^>]*class="photoDepute"[^>]*>')
    SRC = re.compile(r'src="([^"]+)"')
    ALT = re.compile(r'alt="([^"]*)"')
    out, echecs = [], []
    for i, d in enumerate(deputies, 1):
        try:
            page = get(d["profil"])
            tag = IMG.search(page)
            if not tag:
                echecs.append((d["nom_index"], "pas de portrait")); continue
            src = unescape(SRC.search(tag.group(0)).group(1))
            # Certaines fiches portent un alt="" vide (vu sur Saint-Henri–Sainte-Anne).
            # On teste le CONTENU, pas la présence de l'attribut, sinon le nom
            # de la page d'index — parfaitement bon — se fait écraser par du vide.
            m_alt = ALT.search(tag.group(0))
            alt = clean(m_alt.group(1)) if m_alt else ""
            if not alt:
                alt = d["nom_index"]
            fichier = f"{slug(d['circonscription'])}.jpg"
            (OUT_DIR / fichier).write_bytes(get(src, binary=True))
            out.append({"circonscription": d["circonscription"],
                        "circonscription_slug": slug(d["circonscription"]),
                        "nom": alt, "parti": d["parti"],
                        "fichier": f"/images/deputes/{fichier}", "profil": d["profil"]})
            print(f"  [{i}/{len(deputies)}] {alt} — {d['circonscription']}")
        except Exception as e:
            echecs.append((d["nom_index"], str(e)[:70]))
        time.sleep(DELAY)

    OUT_INDEX.write_text(json.dumps({
        "source": "Assemblée nationale du Québec",
        "source_url": "https://www.assnat.qc.ca/fr/deputes/",
        "licence": "Reproduction autorisée pour usage non commercial avec mention de la source.",
        "licence_url": "https://www.assnat.qc.ca/fr/propos-site/droits-propriete-intellectuelle.html",
        "recupere_le": time.strftime("%Y-%m-%d"),
        "deputes": sorted(out, key=lambda x: x["circonscription"]),
    }, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"\n{len(out)} portraits, {len(echecs)} échecs")
    for n, e in echecs:
        print("  échec:", n, "—", e)

if __name__ == "__main__":
    main()

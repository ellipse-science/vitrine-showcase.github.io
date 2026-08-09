#!/usr/bin/env python3
# Recompose `salience_index_qc/roc` à la spec v1 depuis le JSON `articles`,
# pour le BANC DE VALIDATION #430 uniquement.
#
# Pourquoi : la colonne publiée est un MÉLANGE — la spec v1 n'est live en shadow
# que depuis le bloc 15-19 du 2026-08-08, donc les éditions antérieures du
# snapshot portent encore les valeurs de l'ancienne formule. Valider à l'œil
# dessus reviendrait à juger le nouvel indice sur les chiffres de l'ancien.
#
# Réplique EXACTE de _chantiers-vitrine/banc-235/cutover_grilles_specv1.R
# (constantes au tag `spec-v1`). N'écrit jamais dans public/data/.
import json, math, sys
from collections import Counter

EV_K_INTENSITE = 2.0
EV_K_DUREE = 2.0
EV_EPS = 0.05
EV_CAP_ARTICLES_MEDIA = 3
EV_MEDIA_MEAN_TIME = {
    "RCI": 160.0166, "LAP": 120.9031, "JDM": 143.0377, "LED": 241.8293, "MG": 241.3784,
    "TVA": 125.0133, "CBC": 159.4631, "CTV": 227.9302, "VS": 505.2500, "GN": 375.4478,
    "NP": 249.0428, "GAM": 325.8990, "TTS": 221.2727, "CNN": 296.2315, "FXN": 146.0550,
}
MEAN_TIME_DEFAUT = sum(EV_MEDIA_MEAN_TIME.values()) / len(EV_MEDIA_MEAN_TIME)
PAGES_PERMANENTES = {
    "https://www.foxnews.com/video/5614615980001",
    "https://www.foxbusiness.com/video/5640669329001",
}


def ids(s):
    """media_ids_qc/roc : même tolérance de format que le `ids()` du script R."""
    if s is None:
        return []
    if isinstance(s, list):
        return list(dict.fromkeys(str(x).strip() for x in s if str(x).strip()))
    s = str(s).strip()
    if s in ("", "[]"):
        return []
    brut = s.replace("[", "").replace("]", "").replace('"', "").split(",")
    return list(dict.fromkeys(x.strip() for x in brut if x.strip()))


def compte_plafonne(medias):
    """Plafond de 3 articles par média : un média qui publie 12 fois ne pèse
    pas 12 fois. C'est la règle anti-volume du tag spec-v1."""
    return sum(min(EV_CAP_ARTICLES_MEDIA, n) for n in Counter(medias).values())


def minutes_ponderees(medias, minutes):
    """Minutes en Une rapportées au temps de Une MOYEN du média : 60 minutes
    à La Presse (rotation rapide) ne valent pas 60 minutes au Globe."""
    return sum(m / EV_MEDIA_MEAN_TIME.get(md, MEAN_TIME_DEFAUT)
               for md, m in zip(medias, minutes))


def reg_idx_v1(n_plaf, n_out, pond, panel):
    """Moyenne géométrique NON compensatoire des trois facettes bornées.
    Une facette à zéro tire tout l'indice vers son plancher — c'est ce qui
    plafonne un mono-média par construction, sans règle ajoutée."""
    if n_out <= 0 or panel <= 0:
        return 0.0
    vis = min(1.0, max(n_out - 1, 0) / max(panel - 1, 1))
    inten = 1 - math.exp(-(n_plaf / max(n_out, 1)) / EV_K_INTENSITE)
    duree = 1 - math.exp(-pond / EV_K_DUREE)
    return math.exp((math.log(max(inten, EV_EPS))
                     + math.log(max(vis, EV_EPS))
                     + math.log(max(duree, EV_EPS))) / 3)


def facettes(articles, outlet_ids):
    medias, minutes = [], []
    for a in articles:
        md = str(a.get("media_id") or "")
        if md in outlet_ids:
            medias.append(md)
            try:
                minutes.append(float(a.get("headline_minutes") or 0))
            except (TypeError, ValueError):
                minutes.append(0.0)
    return compte_plafonne(medias), minutes_ponderees(medias, minutes)


def main(src, dst):
    rows = json.load(open(src, encoding="utf-8"))
    n_perm = n_sans = 0
    for r in rows:
        brut = r.get("articles")
        try:
            arts = json.loads(brut) if isinstance(brut, str) else (brut or [])
        except json.JSONDecodeError:
            arts = []
        if not isinstance(arts, list) or not arts:
            n_sans += 1
            continue
        avant = len(arts)
        arts = [a for a in arts if a.get("url") not in PAGES_PERMANENTES]
        n_perm += avant - len(arts)
        if not arts:
            n_sans += 1
            continue
        qc_ids, roc_ids = ids(r.get("media_ids_qc")), ids(r.get("media_ids_roc"))
        # Panel QC = 6 depuis la réintégration de TVA (2026-07-19) ; ROC = 7.
        panel_qc = 5 if str(r.get("date_utc", "")) < "2026-07-19" else 6
        plaf_qc, pond_qc = facettes(arts, set(qc_ids))
        plaf_roc, pond_roc = facettes(arts, set(roc_ids))
        r["salience_index_qc"] = reg_idx_v1(plaf_qc, len(qc_ids), pond_qc, panel_qc)
        r["salience_index_roc"] = reg_idx_v1(plaf_roc, len(roc_ids), pond_roc, 7)
    json.dump(rows, open(dst, "w", encoding="utf-8"), ensure_ascii=False)
    print(f"{len(rows)} lignes recomposées → {dst}")
    print(f"captures de pages permanentes retirées : {n_perm} | lignes sans articles : {n_sans}")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])

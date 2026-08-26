#!/usr/bin/env python3
"""Génère l'illustration pédagogique des niveaux de saillance (#35, recalibré #281,
bascule spec v1 le 2026-08-12).

Histogramme de l'ATTENTION CUMULÉE sur 24 h (échelle log) avec les 6 bandes de
percentiles (Très faible / Faible / Modérée / Élevée / Très élevée /
Exceptionnelle = 5/15/30/30/15/5 %). Sert à la page méthodologie (§03) ET à l'équipe.

DONNÉES — la figure doit montrer LA GRANDEUR QUI CLASSE, sinon elle illustre autre
chose que ce que la légende annonce. Depuis vitrine#314 (27-07) le badge et l'ordre
des manchettes tournent sur le cumul 24 h pondéré par récence, et depuis la bascule
spec v1 ce cumul porte sur `salience_index_qc` — pas sur le pic, pas sur `score_qc`.
La population est celle de la grille du badge : un point par storyline (son plus haut
cumul), parmi les Unes RÉELLEMENT AFFICHÉES.

Le CSV est produit par le script de calibration lui-même, pour que la figure et les
seuils ne puissent pas diverger :

    cd _chantiers-vitrine/banc-235 && Rscript grilles_annee_specv1.R
    # → out/cumul24h_qc.csv (et _roc.csv), déjà à l'échelle d'affichage ×100

Usage :  python3 scripts/generate_saillance_levels.py [chemin_csv]
"""
import os
import re
import sys
import numpy as np
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.patches import Rectangle

# Défaut valable depuis la RACINE du dépôt (le dépôt et `_chantiers-vitrine` sont
# voisins). Depuis un worktree, passer le chemin en argument.
CSV = (sys.argv[1] if len(sys.argv) > 1
       else "../_chantiers-vitrine/banc-235/out/cumul24h_qc.csv")
OUT = [
    "public/methodologie/saillance-niveaux.png",
    "docs/saillance-niveaux.png",
]

# Seuils du jour de la bascule = NEW_SUM_QC_THRESHOLDS dans
# lib/data/salienceCutover.ts. ⚠️ Les deux doivent bouger ENSEMBLE : une figure
# qui garde les anciennes bornes place les bandes au mauvais endroit sous un
# histogramme juste. C'est `verifier_coherence_seuils()` plus bas qui le signale
# maintenant — le commentaire seul ne suffisait pas.
TH = [33.8, 41.8, 59.2, 96.5, 157.1]       # p5 / p20 / p50 / p80 / p95, en unités de CUMUL
TS = "lib/data/salienceCutover.ts"         # la source de vérité des seuils

# Depuis vitrine#566 le site affiche des POINTS SUR 100 : le cumul divisé par la
# somme des six poids de récence d'une fenêtre pleine (demi-vie 10 h, blocs de
# 4 h). Même formule que RECENCY_WEIGHT_TOTAL dans le TS ; le CSV du banc et la
# grille mesurée sont convertis ICI, par la même constante, pour que la figure
# montre la grandeur que le lecteur voit à l'écran.
W_TOTAL = sum(2 ** (-4 * k / 10) for k in range(6))   # = 3,347
assert abs(W_TOTAL - 3.3474) < 1e-3, W_TOTAL
TH_PTS = [t / W_TOTAL for t in TH]


def verifier_coherence_seuils():
    """Refuse de dessiner si `TH` a divergé de NEW_SUM_QC_THRESHOLDS.

    La figure et le code de classement doivent lire la MÊME grille : une figure
    juste sous des bandes fausses est le pire des deux mondes, parce qu'elle a
    l'air d'une preuve. On lit donc le TS plutôt que de faire confiance à une
    recopie. Silencieux si le fichier est absent (le script doit rester
    utilisable hors du dépôt) — mais bruyant dès qu'on peut comparer.

    La grille est un OBJET nommé (`{ faible: …, moyenne: … }`), pas un tableau :
    on lit clé par clé, sinon un réordonnancement des champs passerait inaperçu.
    Et si la constante devient introuvable, on ARRÊTE au lieu de laisser filer —
    une garde muette qui a l'air verte est pire que pas de garde du tout.
    """
    if not os.path.exists(TS):
        return
    src = open(TS, encoding="utf8").read()
    # La constante MESURÉE (unités de cumul) ; la grille exportée en points est
    # dérivée d'elle dans le TS par la même division que ci-dessus.
    bloc = re.search(r"SUM_QC_CUMUL_MESURE[^=]*=\s*\{([^}]*)\}", src)
    if not bloc:
        sys.exit(
            f"ERREUR — SUM_QC_CUMUL_MESURE introuvable dans {TS}.\n"
            f"La constante a été renommée ou sa forme a changé : mettre à jour ce\n"
            f"script, sinon la vérification de cohérence des seuils ne protège plus rien."
        )
    ts_vals = []
    for cle in ("faible", "moyenne", "eleve", "tresEleve", "extreme"):
        m = re.search(rf"\b{cle}\s*:\s*(-?\d+\.?\d*)", bloc.group(1))
        if not m:
            sys.exit(f"ERREUR — clé « {cle} » absente de SUM_QC_CUMUL_MESURE dans {TS}.")
        ts_vals.append(float(m.group(1)))
    if ts_vals != TH:
        sys.exit(
            f"ERREUR — les seuils ont divergé.\n"
            f"  ici (TH)          : {TH}\n"
            f"  {TS} : {ts_vals}\n"
            f"Reporter les seuils re-mesurés aux DEUX endroits avant de régénérer."
        )


def charger_scores(chemin):
    """Lit le CSV des cumuls 24 h, avec un message qui dit quoi faire s'il manque."""
    if not os.path.exists(chemin):
        sys.exit(
            f"ERREUR — CSV introuvable : {chemin}\n"
            f"Ce fichier n'est PAS versionné (il sort du banc de calibration). Le produire :\n"
            f"    cd _chantiers-vitrine/banc-235 && Rscript grilles_annee_specv1.R\n"
            f"puis relancer, au besoin en passant le chemin en argument :\n"
            f"    python3 scripts/generate_saillance_levels.py <chemin_csv>"
        )
    brut = open(chemin, encoding="utf8").read().replace("\n", ",")
    return np.array([float(x) for x in brut.split(",") if x.strip()])
PLABELS = ["p5", "p20", "p50", "p80", "p95"]
BANDS = ["Très faible", "Faible", "Modérée", "Élevée", "Très élevée", "Exceptionnelle"]
PCTS = ["5 %", "15 %", "30 %", "30 %", "15 %", "5 %"]
# Sable (calme) -> cordovan (chaud) : la saillance « chauffe » vers la droite.
COLORS = ["#E4DCC6", "#DCCBA2", "#D2B488", "#C99A76", "#BE7C6A", "#A85A52"]

PAPER = "#F2ECDD"
INK = "#231F1C"
RULE = "#B8AE99"

verifier_coherence_seuils()
sc = charger_scores(CSV) / W_TOTAL   # points sur 100, comme à l'écran
n = len(sc)

fig, ax = plt.subplots(figsize=(17.6, 9.8), dpi=100)
fig.patch.set_facecolor(PAPER)
ax.set_facecolor(PAPER)

# Bins réguliers en espace log (la distribution devient une cloche).
lo, hi = sc.min(), sc.max()
# La marge de droite n'est pas cosmétique : la bande « Exceptionnelle » est
# ouverte (tout ce qui dépasse le p95) et doit rester assez large pour porter son
# étiquette. Avec le p95 du cumul (157,1) très proche du maximum observé, une
# marge de 10 % la réduisait à un liseré et le mot débordait du cadre.
bins = np.logspace(np.log10(lo * 0.85), np.log10(hi * 1.45), 34)
counts, edges = np.histogram(sc, bins=bins)
ymax = counts.max()
# 1,32 et non 1,18 : sur l'échelle en points la barre la plus haute tombe dans
# « Modérée », juste sous les libellés de bande — à 1,18 le « 30 % » était
# caché derrière elle.
band_top = ymax * 1.32

# Bandes colorées (de 0 au bord gauche du tracé jusqu'aux seuils puis au-delà).
xleft = bins[0]
xright = bins[-1]
edges_x = [xleft] + TH_PTS + [xright]
for i in range(6):
    ax.add_patch(Rectangle((edges_x[i], 0), edges_x[i + 1] - edges_x[i], band_top,
                           facecolor=COLORS[i], edgecolor="none", alpha=0.85, zorder=0))

# Histogramme.
ax.bar(edges[:-1], counts, width=np.diff(edges), align="edge",
       color=INK, edgecolor=PAPER, linewidth=0.6, zorder=3)

# Lignes de seuil + étiquettes percentile/valeur (une ligne, sous l'axe).
for x, pl in zip(TH_PTS, PLABELS):
    ax.plot([x, x], [0, band_top], ls=(0, (4, 3)), color=INK, lw=1.1, zorder=4)
    ax.annotate(f"{pl} · {x:.1f}".replace(".", ","), xy=(x, 0), xytext=(0, -5), textcoords="offset points",
                ha="center", va="top", fontsize=10, color="#8A2B22", zorder=5,
                fontweight="bold")

# Labels de bande + pourcentage (centrés dans chaque bande, en haut).
for i in range(6):
    xc = np.sqrt(edges_x[i] * edges_x[i + 1])  # centre géométrique (échelle log)
    ax.text(xc, band_top * 0.96, BANDS[i], ha="center", va="top",
            fontsize=14, fontweight="bold", color=INK, zorder=6)
    ax.text(xc, band_top * 0.855, PCTS[i], ha="center", va="top",
            fontsize=12, color="#5B544A", zorder=6)

ax.set_xscale("log")
ax.set_xlim(xleft, xright)
ax.set_ylim(0, band_top)
ax.set_xticks([10, 15, 20, 30, 45, 70])
ax.get_xaxis().set_major_formatter(matplotlib.ticker.ScalarFormatter())
# En échelle log, matplotlib ajoute de lui-même des graduations MINEURES, qu'il
# étiquette en notation scientifique (« 2 × 10² ») dès que la plage s'étend. Sur
# une figure destinée au grand public, c'est un caractère de bruit — et il n'est
# apparu qu'en élargissant la marge de droite ci-dessus.
ax.get_xaxis().set_minor_formatter(matplotlib.ticker.NullFormatter())
# Ticks Y adaptatifs au volume (l'échantillon post-fusion est encore mince).
_yt = [t for t in [0, 10, 20, 30, 40] if t <= band_top]
ax.set_yticks(_yt if len(_yt) >= 2 else [0, max(1, int(round(ymax)))])
ax.tick_params(colors="#5B544A", labelsize=11)
ax.tick_params(axis="x", pad=22)
for s in ["top", "right"]:
    ax.spines[s].set_visible(False)
for s in ["left", "bottom"]:
    ax.spines[s].set_color(RULE)
ax.set_ylabel("Nombre d'histoires", color="#5B544A", fontsize=11)
ax.set_xlabel("Points d'attention au Québec sur 24 h, sur 100  (échelle log)",
              color="#5B544A", fontsize=12, labelpad=30)

# Titre + sous-titre + pied (sans em-dash).
fig.text(0.055, 0.95, "Comment on calcule les niveaux de saillance",
         fontsize=25, fontweight="bold", color=INK, ha="left", va="top")
fig.text(0.055, 0.895,
         "L'étiquette situe les POINTS D'ATTENTION de l'histoire sur 24 h (sur 100, les heures récentes comptant davantage) dans la distribution\n"
         # NE PAS réintroduire « cloche en échelle log » : c'était vrai de la
         # distribution des PICS, pas de celle des cumuls, qui s'étale. La
         # légende doit décrire la figure qu'on regarde, pas celle d'avant.
         "de TOUTES les Unes d'une année : des bandes par percentiles, autant de « Très faible » que d'« Exceptionnelle », et 60 % des histoires au centre.",
         fontsize=13, color="#5B544A", ha="left", va="top")
fig.text(0.055, 0.028,
         f"n = {n} histoires (plus hauts points 24 h par storyline QC, parmi les Unes affichées), 2025-05-17 au 2026-08-07.\n"
         "Source : headline_events_4h rejoué localement, indice spec v1.  Seuils mesurés le 2026-08-12, en points sur 100 depuis le 2026-08-22.",
         fontsize=10.5, color="#8A8474", ha="left", va="bottom")

plt.subplots_adjust(left=0.055, right=0.965, top=0.80, bottom=0.20)
for path in OUT:
    fig.savefig(path, facecolor=PAPER)
    print("écrit", path)
print(f"n={n}  bandes réelles %:",
      [round(100 * c / n, 1) for c in np.histogram(sc, bins=[0] + TH_PTS + [1e9])[0]])

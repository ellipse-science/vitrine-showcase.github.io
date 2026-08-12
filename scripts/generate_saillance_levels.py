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

    cd _chantiers-vitrine/banc-235 && Rscript cutover_grilles_specv1.R
    # → out/cumul24h_qc.csv (et _roc.csv), déjà à l'échelle d'affichage ×100

Usage :  python3 scripts/generate_saillance_levels.py [chemin_csv]
"""
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
# histogramme juste, et rien ne le signale.
TH = [32.9, 40.6, 60.6, 87.8, 147.7]       # p5 / p20 / p50 / p80 / p95
PLABELS = ["p5", "p20", "p50", "p80", "p95"]
BANDS = ["Très faible", "Faible", "Modérée", "Élevée", "Très élevée", "Exceptionnelle"]
PCTS = ["5 %", "15 %", "30 %", "30 %", "15 %", "5 %"]
# Sable (calme) -> cordovan (chaud) : la saillance « chauffe » vers la droite.
COLORS = ["#E4DCC6", "#DCCBA2", "#D2B488", "#C99A76", "#BE7C6A", "#A85A52"]

PAPER = "#F2ECDD"
INK = "#231F1C"
RULE = "#B8AE99"

sc = np.array([float(x) for x in open(CSV).read().replace("\n", ",").split(",") if x.strip()])
n = len(sc)

fig, ax = plt.subplots(figsize=(17.6, 9.8), dpi=100)
fig.patch.set_facecolor(PAPER)
ax.set_facecolor(PAPER)

# Bins réguliers en espace log (la distribution devient une cloche).
lo, hi = sc.min(), sc.max()
# La marge de droite n'est pas cosmétique : la bande « Exceptionnelle » est
# ouverte (tout ce qui dépasse le p95) et doit rester assez large pour porter son
# étiquette. Avec le p95 du cumul (147,7) très proche du maximum observé, une
# marge de 10 % la réduisait à un liseré et le mot débordait du cadre.
bins = np.logspace(np.log10(lo * 0.85), np.log10(hi * 1.45), 34)
counts, edges = np.histogram(sc, bins=bins)
ymax = counts.max()
band_top = ymax * 1.18

# Bandes colorées (de 0 au bord gauche du tracé jusqu'aux seuils puis au-delà).
xleft = bins[0]
xright = bins[-1]
edges_x = [xleft] + TH + [xright]
for i in range(6):
    ax.add_patch(Rectangle((edges_x[i], 0), edges_x[i + 1] - edges_x[i], band_top,
                           facecolor=COLORS[i], edgecolor="none", alpha=0.85, zorder=0))

# Histogramme.
ax.bar(edges[:-1], counts, width=np.diff(edges), align="edge",
       color=INK, edgecolor=PAPER, linewidth=0.6, zorder=3)

# Lignes de seuil + étiquettes percentile/valeur (une ligne, sous l'axe).
for x, pl in zip(TH, PLABELS):
    ax.plot([x, x], [0, band_top], ls=(0, (4, 3)), color=INK, lw=1.1, zorder=4)
    ax.annotate(f"{pl} · {x}", xy=(x, 0), xytext=(0, -5), textcoords="offset points",
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
ax.set_xticks([30, 40, 60, 90, 150])
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
ax.set_xlabel("Attention cumulée au Québec sur 24 h  (échelle log)",
              color="#5B544A", fontsize=12, labelpad=30)

# Titre + sous-titre + pied (sans em-dash).
fig.text(0.055, 0.95, "Comment on calcule les niveaux de saillance",
         fontsize=25, fontweight="bold", color=INK, ha="left", va="top")
fig.text(0.055, 0.895,
         "L'étiquette situe l'ATTENTION CUMULÉE par l'histoire sur 24 h, les heures récentes comptant davantage, dans la distribution\n"
         # NE PAS réintroduire « cloche en échelle log » : c'était vrai de la
         # distribution des PICS, pas de celle des cumuls, qui s'étale. La
         # légende doit décrire la figure qu'on regarde, pas celle d'avant.
         "de TOUTES les Unes récentes : des bandes par percentiles, autant de « Très faible » que d'« Exceptionnelle », et 60 % des histoires au centre.",
         fontsize=13, color="#5B544A", ha="left", va="top")
fig.text(0.055, 0.028,
         f"n = {n} histoires (plus haut cumul 24 h par storyline QC, parmi les Unes affichées) depuis le 2026-07-23.  "
         "Source : headline_events_4h (DEV), indice spec v1.  Seuils mesurés le 2026-08-12 ; recalcul glissant côté données.",
         fontsize=10.5, color="#8A8474", ha="left", va="bottom")

plt.subplots_adjust(left=0.055, right=0.965, top=0.80, bottom=0.20)
for path in OUT:
    fig.savefig(path, facecolor=PAPER)
    print("écrit", path)
print(f"n={n}  bandes réelles %:",
      [round(100 * c / n, 1) for c in np.histogram(sc, bins=[0] + TH + [1e9])[0]])

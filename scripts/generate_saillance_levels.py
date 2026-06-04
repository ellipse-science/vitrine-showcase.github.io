#!/usr/bin/env python3
"""Génère l'illustration pédagogique des niveaux de saillance (#35).

Histogramme de `score_qc` (échelle log) avec les 6 bandes de percentiles
(Très faible / Faible / Modérée / Élevée / Très élevée / Extrême = 5/15/30/30/15/5 %).
Sert à la page méthodologie (§03) ET à l'équipe.

DONNÉES — les valeurs de `score_qc` viennent de la table Athena DEV
`headline_events_4h` (toute la donnée dispo). Pour rafraîchir le CSV source :

    Rscript -e 'readRenviron("~/.Renviron"); library(tube); library(DBI);
      conn <- ellipse_connect(env="DEV", database="datamarts");
      df <- DBI::dbGetQuery(conn, paste0(\"SELECT score_qc, event_id FROM \",
        chr(34), \"vitrine_datamart-headline_events_4h\", chr(34)));
      d <- df[!is.na(df$score_qc) & df$score_qc>0, ];
      d <- d[!duplicated(d$event_id), ];
      writeLines(paste(d$score_qc, collapse=\",\"), \"/tmp/score_qc_dedup.csv\")'

Usage :  python3 scripts/generate_saillance_levels.py [chemin_csv]
"""
import sys
import numpy as np
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.patches import Rectangle

CSV = sys.argv[1] if len(sys.argv) > 1 else "/tmp/score_qc_dedup.csv"
OUT = [
    "public/methodologie/saillance-niveaux.png",
    "docs/saillance-niveaux.png",
]

# Seuils recalibrés (2026-06-03, 406 Unes) = SAL_QC_THRESHOLDS côté frontend.
TH = [5, 10, 19, 36, 71]                  # p5 / p20 / p50 / p80 / p95
PLABELS = ["p5", "p20", "p50", "p80", "p95"]
BANDS = ["Très faible", "Faible", "Modérée", "Élevée", "Très élevée", "Extrême"]
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
bins = np.logspace(np.log10(lo * 0.85), np.log10(hi * 1.1), 34)
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
ax.set_xticks([1, 5, 10, 20, 40, 80, 160])
ax.get_xaxis().set_major_formatter(matplotlib.ticker.ScalarFormatter())
ax.set_yticks([0, 10, 20, 30])
ax.tick_params(colors="#5B544A", labelsize=11)
ax.tick_params(axis="x", pad=22)
for s in ["top", "right"]:
    ax.spines[s].set_visible(False)
for s in ["left", "bottom"]:
    ax.spines[s].set_color(RULE)
ax.set_ylabel("Nombre de Unes", color="#5B544A", fontsize=11)
ax.set_xlabel("Score de saillance au Québec  (échelle log)",
              color="#5B544A", fontsize=12, labelpad=30)

# Titre + sous-titre + pied (sans em-dash).
fig.text(0.055, 0.95, "Comment on calcule les niveaux de saillance",
         fontsize=25, fontweight="bold", color=INK, ha="left", va="top")
fig.text(0.055, 0.895,
         "Chaque Une reçoit un score de saillance (score_qc). On le situe dans la distribution de TOUTES les Unes\n"
         "récentes : des bandes par percentiles, autant de « Très faible » que d'« Extrême », le gros au centre (cloche en échelle log).",
         fontsize=13, color="#5B544A", ha="left", va="top")
fig.text(0.055, 0.028,
         f"n = {n} Unes depuis le 14 mai 2026 (toute la donnée dispo, fenêtre qui s'étend).  "
         "Source : headline_events_4h (DEV).  Seuils recalibrés en continu (#122).",
         fontsize=10.5, color="#8A8474", ha="left", va="bottom")

plt.subplots_adjust(left=0.055, right=0.965, top=0.80, bottom=0.20)
for path in OUT:
    fig.savefig(path, facecolor=PAPER)
    print("écrit", path)
print(f"n={n}  bandes réelles %:",
      [round(100 * c / n, 1) for c in np.histogram(sc, bins=[0] + TH + [1e9])[0]])

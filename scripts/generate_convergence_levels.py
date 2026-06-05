#!/usr/bin/env python3
"""Generate a methodology chart for Module 2 convergence distribution.

Input CSV: one numeric convergence score per line or comma-separated values.
Default path: /tmp/convergence_interval.csv

Outputs:
- public/methodologie/convergence-niveaux.png
- docs/convergence-niveaux.png
"""

import sys
from collections import defaultdict

import numpy as np
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.patches import Rectangle

CSV = sys.argv[1] if len(sys.argv) > 1 else "/tmp/convergence_interval.csv"
OUT = [
    "public/methodologie/convergence-niveaux.png",
    "docs/convergence-niveaux.png",
]

PAPER = "#F2ECDD"
INK = "#231F1C"
RULE = "#B8AE99"
COLORS = ["#E4DCC6", "#DCCBA2", "#D2B488", "#C99A76", "#BE7C6A", "#A85A52"]
BANDS = ["Tres faible", "Faible", "Moderee", "Elevee", "Tres elevee", "Extreme"]
PCTS = ["5 %", "15 %", "30 %", "30 %", "15 %", "5 %"]
PLABELS = ["p5", "p20", "p50", "p80", "p95"]

raw = open(CSV, "r", encoding="utf-8").read().replace("\n", ",")
vals = np.array([float(x.strip()) for x in raw.split(",") if x.strip()])
if vals.size == 0:
    raise SystemExit("No values in input CSV")

vals = np.clip(vals, 0, 100)

q = {
    "p5": float(np.quantile(vals, 0.05)),
    "p20": float(np.quantile(vals, 0.20)),
    "p50": float(np.quantile(vals, 0.50)),
    "p80": float(np.quantile(vals, 0.80)),
    "p95": float(np.quantile(vals, 0.95)),
}
thresholds = [q["p5"], q["p20"], q["p50"], q["p80"], q["p95"]]

fig, ax = plt.subplots(figsize=(17.6, 9.8), dpi=100)
fig.patch.set_facecolor(PAPER)
ax.set_facecolor(PAPER)

bins = np.arange(0, 101, 4)
counts, edges = np.histogram(vals, bins=bins)
ymax = max(1, int(counts.max()))
band_top = ymax * 1.18

xleft = 0.0
xright = 100.0
edges_x = [xleft] + thresholds + [xright]
for i in range(6):
    w = max(0.0, edges_x[i + 1] - edges_x[i])
    ax.add_patch(
        Rectangle(
            (edges_x[i], 0),
            w,
            band_top,
            facecolor=COLORS[i],
            edgecolor="none",
            alpha=0.85,
            zorder=0,
        )
    )

ax.bar(
    edges[:-1],
    counts,
    width=np.diff(edges),
    align="edge",
    color=INK,
    edgecolor=PAPER,
    linewidth=0.6,
    zorder=3,
)

line_groups = defaultdict(int)
for x, pl in zip(thresholds, PLABELS):
    xk = round(x, 2)
    idx = line_groups[xk]
    line_groups[xk] += 1
    ax.plot([x, x], [0, band_top], ls=(0, (4, 3)), color=INK, lw=1.1, zorder=4)
    yoff = -6 - (idx * 14)
    ax.annotate(
        f"{pl} · {x:.1f}",
        xy=(x, 0),
        xytext=(0, yoff),
        textcoords="offset points",
        ha="center",
        va="top",
        fontsize=10,
        color="#8A2B22",
        zorder=5,
        fontweight="bold",
    )

for i in range(6):
    a, b = edges_x[i], edges_x[i + 1]
    if b - a < 2.0:
        continue
    xc = (a + b) / 2.0
    ax.text(
        xc,
        band_top * 0.96,
        BANDS[i],
        ha="center",
        va="top",
        fontsize=14,
        fontweight="bold",
        color=INK,
        zorder=6,
    )
    ax.text(
        xc,
        band_top * 0.855,
        PCTS[i],
        ha="center",
        va="top",
        fontsize=12,
        color="#5B544A",
        zorder=6,
    )

ax.set_xlim(0, 100)
ax.set_ylim(0, band_top)
ax.set_xticks(np.arange(0, 101, 10))
ax.tick_params(colors="#5B544A", labelsize=11)
ax.tick_params(axis="x", pad=22)
for side in ["top", "right"]:
    ax.spines[side].set_visible(False)
for side in ["left", "bottom"]:
    ax.spines[side].set_color(RULE)

ax.set_ylabel("Nombre d'intervalles 4h", color="#5B544A", fontsize=11)
ax.set_xlabel("Indice de convergence QC/Canada (0 a 100)", color="#5B544A", fontsize=12, labelpad=30)

fig.text(
    0.055,
    0.95,
    "Module 2 - Distribution des indices de convergence",
    fontsize=25,
    fontweight="bold",
    color=INK,
    ha="left",
    va="top",
)
fig.text(
    0.055,
    0.895,
    "Meme logique que pour la saillance: bandes par percentiles p5/p20/p50/p80/p95.\n"
    "Attention: la distribution est tres asymetrique (beaucoup de valeurs a 0).",
    fontsize=13,
    color="#5B544A",
    ha="left",
    va="top",
)
fig.text(
    0.055,
    0.028,
    f"n = {vals.size} intervalles 4h. Source: vitrine_datamart-headline_events_4h (DEV).",
    fontsize=10.5,
    color="#8A8474",
    ha="left",
    va="bottom",
)

plt.subplots_adjust(left=0.055, right=0.965, top=0.80, bottom=0.20)
for out in OUT:
    fig.savefig(out, facecolor=PAPER)
    print(f"wrote {out}")

print("thresholds:", {k: round(v, 2) for k, v in q.items()})

#!/usr/bin/env python3
"""Graphiques de méthodologie — Module 2 « Deux solitudes ».

Indice de convergence = cosinus des objets saillants QC vs CAN par bloc de 4 h
(pondération par saillance ≈ TF ; hors 4 termes géo génériques : Canada, É.-U.,
Québec, Ottawa). Même famille que l'analyse des budgets publiée dans La Presse
(cosinus de similitude). Le TF-IDF n'est PAS appliqué : il efface les grandes
histoires fédérales fréquentes qui sont justement le signal de convergence.

Calibré sur 13 mois (2025-05 → 2026-06) après le red-team du 2026-06-05
(la fenêtre de mai 2026 seule était un creux saisonnier non représentatif).

Figures :
  - convergence-niveaux.png        : distribution 13 mois, 4 niveaux (25/50/75)
  - convergence-discussion.png     : tendance mensuelle (saisonnalité)
  - convergence-niveaux-4mois.png  : distribution des blocs des 4 derniers mois

Entrée : /tmp/metrics_year.json — {brut:[...], blks:["YYYY-MM-DD HH-HH", ...]}
"""

import json
import sys
from collections import defaultdict
import statistics as st

import numpy as np
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import matplotlib.font_manager as fm
from matplotlib.ticker import MultipleLocator

SRC = sys.argv[1] if len(sys.argv) > 1 else "/tmp/metrics_year.json"
OUT_DIRS = ["docs", "public/methodologie"]

PAPER = "#F3ECDD"; INK = "#231F1C"; INK_SOFT = "#7A7064"; RULE = "#C8BDA6"
DIV = "#6B1E2A"; CON = "#2E4663"

_AV = {f.name for f in fm.fontManager.ttflist}
def _pick(c, fb):
    for x in c:
        if x in _AV:
            return x
    return fb
F_TITLE = _pick(["Playfair Display", "Charter", "Palatino", "Georgia"], "DejaVu Serif")
F_BODY = _pick(["Source Serif Pro", "Source Serif 4", "Georgia"], "DejaVu Serif")
F_MONO = _pick(["IBM Plex Mono", "Menlo"], "DejaVu Sans Mono")
plt.rcParams.update({"figure.facecolor": PAPER, "savefig.facecolor": PAPER, "axes.facecolor": PAPER})

MONTHS_FR = {"01": "jan", "02": "fév", "03": "mar", "04": "avr", "05": "mai", "06": "juin",
             "07": "juil", "08": "août", "09": "sep", "10": "oct", "11": "nov", "12": "déc"}
BANDS4 = [(0, 25, "#6B1E2A", "Divergence"), (25, 50, "#9A5A3C", "Divergence partielle"),
          (50, 75, "#4E6374", "Convergence partielle"), (75, 100, "#2E4663", "Convergence")]

m = json.load(open(SRC))
V_ALL = np.array(m["brut"]); BLKS = m["blks"]


def style(ax):
    for s in ("top", "right"):
        ax.spines[s].set_visible(False)
    for s in ("left", "bottom"):
        ax.spines[s].set_color(RULE); ax.spines[s].set_linewidth(0.8)
    ax.tick_params(colors=INK_SOFT, labelsize=9, length=3)
    ax.grid(axis="y", color=RULE, alpha=0.30, linewidth=0.6); ax.set_axisbelow(True)
    for t in ax.get_xticklabels() + ax.get_yticklabels():
        t.set_fontfamily(F_MONO)


def footer(fig, n, window, y=0.045):
    fig.text(0.065, y, f"n = {n} blocs de 4 h · {window} · cosinus des objets saillants, "
             f"hors géo générique (Canada, É.-U., Québec, Ottawa) · Athena DEV",
             fontfamily=F_MONO, fontsize=7.5, color=INK_SOFT)


def save(fig, name):
    for d in OUT_DIRS:
        fig.savefig(f"{d}/{name}", dpi=200)
    plt.close(fig)


def make_niveaux(V, name, title, sub1, sub2, window):
    n = len(V); med = float(np.median(V))
    fig, ax = plt.subplots(figsize=(12, 6.6))
    fig.subplots_adjust(left=0.07, right=0.965, top=0.78, bottom=0.155)
    counts, edges = np.histogram(V, bins=np.arange(0, 101, 4)); centers = (edges[:-1] + edges[1:]) / 2
    ymax = counts.max() * 1.20
    for a, b, col, nm in BANDS4:
        ax.axvspan(a, b, color=col, alpha=0.12, zorder=0)
        c = int(((V >= a) & (V < (b if b < 100 else 101))).sum())
        xc = (a + b) / 2
        ax.text(xc, ymax * 0.97, nm.upper(), ha="center", va="top", fontfamily=F_MONO,
                fontsize=10.5 if len(nm) < 20 else 9.3, color=col, weight="bold")
        ax.text(xc, ymax * 0.885, f"{c} blocs", ha="center", va="top", fontfamily=F_BODY, fontsize=11.5, color=INK, style="italic")
        ax.text(xc, ymax * 0.815, f"{100*c/n:.0f} %", ha="center", va="top", fontfamily=F_BODY, fontsize=9.5, color=INK_SOFT)
    for t in (25, 50, 75):
        ax.axvline(t, color=INK, lw=0.9, ls=(0, (4, 3)), alpha=0.5, zorder=2)
    ax.axvline(med, color=INK, lw=1.4, zorder=4)
    ax.text(med + 1.5, ymax * 0.55, f"médiane {med:.0f} %", fontfamily=F_MONO, fontsize=9, color=INK)
    for ct, cn in zip(counts, centers):
        if ct > 0:
            ax.bar(cn, ct, width=3.5, color=INK, edgecolor=PAPER, linewidth=0.5, zorder=3)
    ax.set_xlim(0, 100); ax.set_ylim(0, ymax); ax.xaxis.set_major_locator(MultipleLocator(10))
    style(ax)
    ax.set_xlabel("Indice de convergence du bloc  (0 = agendas opposés  ·  100 = mêmes priorités)", fontfamily=F_BODY, fontsize=10.5, color=INK, labelpad=8)
    ax.set_ylabel("Nombre de blocs de 4 h", fontfamily=F_BODY, fontsize=10.5, color=INK)
    fig.text(0.07, 0.93, title, fontfamily=F_TITLE, fontsize=21, color=INK, weight="bold")
    fig.text(0.07, 0.875, sub1, fontfamily=F_BODY, fontsize=12, color=INK_SOFT, style="italic")
    fig.text(0.07, 0.845, sub2, fontfamily=F_BODY, fontsize=12, color=INK_SOFT, style="italic")
    footer(fig, n, window)
    save(fig, name)
    return med


# === Figure 1 — distribution 13 mois ===
med = make_niveaux(
    V_ALL, "convergence-niveaux.png", "La convergence Québec–Canada sur 13 mois",
    f"Indice de convergence par bloc de 4 h (cosinus des objets saillants), classé en quatre niveaux. Médiane {np.median(V_ALL):.0f} %.",
    "La divergence domine, mais c'est un vrai continuum : un cinquième des blocs montrent un recoupement marqué.",
    "2025-05 → 2026-06")

# === Figure 2 — tendance mensuelle (sans flèche rouge) ===
bym = defaultdict(list)
for b, v in zip(BLKS, V_ALL):
    bym[b[:7]].append(int(v))
months = sorted(bym)
med_m = [st.median(bym[mo]) for mo in months]
labels = [f"{MONTHS_FR[mo[5:7]]}\n{mo[:4]}" for mo in months]
x = np.arange(len(months))
imin = int(np.argmin(med_m)); imax = int(np.argmax(med_m))

fig, ax = plt.subplots(figsize=(12, 6.4))
fig.subplots_adjust(left=0.07, right=0.965, top=0.79, bottom=0.135)
for a, b, col, _ in BANDS4:
    ax.axhspan(a, min(b, 100), color=col, alpha=0.06, zorder=0)
for yv in (25, 50, 75):
    ax.axhline(yv, color=INK, lw=0.7, ls=(0, (4, 3)), alpha=0.35, zorder=1)
ax.plot(x, med_m, color=INK, lw=2, zorder=4)
ax.scatter(x, med_m, s=34, color=INK, zorder=5, edgecolor=PAPER, linewidth=1)
# pic et creux en texte simple, sans flèche
ax.annotate(f"pic · {med_m[imax]:.0f} %", xy=(imax, med_m[imax]), xytext=(0, 9),
            textcoords="offset points", fontfamily=F_MONO, fontsize=9.5, color=CON, ha="center")
ax.annotate(f"creux · {med_m[imin]:.0f} %", xy=(imin, med_m[imin]), xytext=(0, -16),
            textcoords="offset points", fontfamily=F_MONO, fontsize=9.5, color=DIV, ha="center")
ax.set_xticks(x); ax.set_xticklabels(labels, fontfamily=F_MONO, fontsize=8.5)
ax.set_ylim(0, max(med_m) * 1.32); ax.set_xlim(-0.6, len(months) - 0.4)
ax.set_ylabel("Convergence médiane du mois (%)", fontfamily=F_BODY, fontsize=10.5, color=INK)
style(ax); ax.grid(axis="x", visible=False)
fig.text(0.07, 0.945, "La convergence varie fortement selon la période", fontfamily=F_TITLE, fontsize=20, color=INK, weight="bold")
fig.text(0.07, 0.895, f"Médiane mensuelle de l'indice : de {min(med_m):.0f} % à {max(med_m):.0f} %. Aucun seuil fixe ne tient toute l'année —",
         fontfamily=F_BODY, fontsize=11.5, color=INK_SOFT, style="italic")
fig.text(0.07, 0.863, "le mot affiché dans le module gagne à se baser sur une fenêtre glissante, pas sur la valeur brute.",
         fontfamily=F_BODY, fontsize=11.5, color=INK_SOFT, style="italic")
footer(fig, len(V_ALL), "2025-05 → 2026-06", y=0.035)
save(fig, "convergence-discussion.png")

# === Figure 3 — chaque bloc de 4 h sur les 3 derniers mois (points) ===
import datetime as dt
import matplotlib.dates as mdates

def band_color(v):
    return DIV if v < 25 else "#9A5A3C" if v < 50 else "#4E6374" if v < 75 else CON

last3 = sorted({b[:7] for b in BLKS})[-3:]
pts = [(b, v) for b, v in zip(BLKS, V_ALL) if b[:7] in last3]
def to_dt(b):
    d, iv = b.split(" ")
    h = int(iv.split("-")[0])
    return dt.datetime.strptime(d, "%Y-%m-%d") + dt.timedelta(hours=h)
xs = [to_dt(b) for b, _ in pts]; ys = [v for _, v in pts]
win3 = f"{MONTHS_FR[last3[0][5:7]]}. → {MONTHS_FR[last3[-1][5:7]]}. {last3[-1][:4]}"

fig, ax = plt.subplots(figsize=(12, 6.4))
fig.subplots_adjust(left=0.065, right=0.86, top=0.79, bottom=0.135)
for a, b, col, _ in BANDS4:
    ax.axhspan(a, min(b, 100), color=col, alpha=0.07, zorder=0)
for yv in (25, 50, 75):
    ax.axhline(yv, color=INK, lw=0.7, ls=(0, (4, 3)), alpha=0.35, zorder=1)
ax.scatter(xs, ys, s=15, c=[band_color(v) for v in ys], alpha=0.65, edgecolor=PAPER, linewidth=0.25, zorder=3)
# moyenne quotidienne (ligne de lecture)
byday = defaultdict(list)
for b, v in pts:
    byday[b.split(" ")[0]].append(v)
days = sorted(byday)
day_dt = [dt.datetime.strptime(d, "%Y-%m-%d") + dt.timedelta(hours=12) for d in days]
ax.plot(day_dt, [st.mean(byday[d]) for d in days], color=INK, lw=1.3, alpha=0.85, zorder=4)
ax.set_ylim(0, 100)
ax.xaxis.set_major_locator(mdates.WeekdayLocator(byweekday=mdates.MO, interval=2))
ax.xaxis.set_major_formatter(mdates.DateFormatter("%d %b"))
ax.set_ylabel("Indice de convergence du bloc (%)", fontfamily=F_BODY, fontsize=10.5, color=INK)
style(ax); ax.grid(axis="x", visible=False)
# noms des bandes à droite (marge réservée)
xr = max(xs) + dt.timedelta(days=1.5)
for a, b, col, nm in BANDS4:
    ax.text(xr, (a + min(b, 100)) / 2, nm, va="center", ha="left", fontfamily=F_MONO, fontsize=8, color=col, clip_on=False)
fig.text(0.065, 0.945, "Chaque bloc de 4 h — 3 derniers mois", fontfamily=F_TITLE, fontsize=20, color=INK, weight="bold")
fig.text(0.065, 0.895, f"Un point = un bloc de 4 h ({win3}, n={len(pts)}), coloré par niveau ; la ligne est la moyenne quotidienne.",
         fontfamily=F_BODY, fontsize=11.5, color=INK_SOFT, style="italic")
fig.text(0.065, 0.863, "La convergence change d'un bloc à l'autre — quelques pics nets, beaucoup de blocs divergents.",
         fontfamily=F_BODY, fontsize=11.5, color=INK_SOFT, style="italic")
footer(fig, len(pts), win3, y=0.035)
save(fig, "convergence-blocs-3mois.png")

print(f"OK — 3 figures. 13 mois: médiane {med:.0f}% · scatter 3 mois ({win3}): n={len(pts)}")

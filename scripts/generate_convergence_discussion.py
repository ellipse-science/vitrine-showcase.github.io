#!/usr/bin/env python3
"""Generate a discussion-ready Module 2 convergence chart.

Input CSV headers required:
- date_utc (YYYY-MM-DD)
- time_interval_utc (e.g. 08-12)
- conv (0..100)

Outputs:
- docs/convergence-discussion.png
- public/methodologie/convergence-discussion.png
"""

from __future__ import annotations

import csv
import datetime as dt
import statistics as stats
import sys
from collections import defaultdict

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np

IN_CSV = sys.argv[1] if len(sys.argv) > 1 else "/tmp/convergence_timeseries.csv"
OUT = [
    "docs/convergence-discussion.png",
    "public/methodologie/convergence-discussion.png",
]

PAPER = "#F2ECDD"
INK = "#231F1C"
RULE = "#B8AE99"
SOFT = "#5B544A"
CORDOVAN = "#6B1E2A"
QC_BLUE = "#2E4663"
BAND_COLORS = ["#E4DCC6", "#DCCBA2", "#D2B488", "#C99A76", "#BE7C6A"]


def parse_start_hour(interval_utc: str) -> int:
    try:
        return int((interval_utc or "").split("-")[0])
    except Exception:
        return 0


def percentile_rank(sorted_vals: list[float], x: float) -> float:
    """Return percentile rank in [0,100] with tie handling (mid-rank).

    Formula: P = 100 * (count(v<x) + 0.5*count(v==x)) / n
    """
    if not sorted_vals:
        return 0.0
    less = sum(1 for v in sorted_vals if v < x)
    equal = sum(1 for v in sorted_vals if v == x)
    return 100.0 * (less + 0.5 * equal) / len(sorted_vals)


rows: list[tuple[dt.date, str, float]] = []
with open(IN_CSV, "r", encoding="utf-8") as f:
    reader = csv.DictReader(f)
    for r in reader:
        try:
            d = dt.date.fromisoformat(r["date_utc"])
            it = str(r["time_interval_utc"])
            c = float(r["conv"])
        except Exception:
            continue
        rows.append((d, it, max(0.0, min(100.0, c))))

if not rows:
    raise SystemExit("No valid rows in input CSV")

rows.sort(key=lambda x: (x[0], parse_start_hour(x[1])))
latest_date, latest_interval, latest_conv = rows[-1]

window_start = latest_date - dt.timedelta(days=29)
window_rows = [r for r in rows if r[0] >= window_start]
if len(window_rows) < 20:
    window_rows = rows

conv_vals = sorted([r[2] for r in window_rows])
n = len(conv_vals)

p20 = float(np.quantile(conv_vals, 0.20))
p40 = float(np.quantile(conv_vals, 0.40))
p60 = float(np.quantile(conv_vals, 0.60))
p80 = float(np.quantile(conv_vals, 0.80))
live_pct_rank = percentile_rank(conv_vals, latest_conv)

if live_pct_rank <= 20:
    regime = "Tres divergent"
elif live_pct_rank <= 40:
    regime = "Divergent"
elif live_pct_rank <= 60:
    regime = "Mixte"
elif live_pct_rank <= 80:
    regime = "Convergent"
else:
    regime = "Tres convergent"

by_day: dict[dt.date, list[float]] = defaultdict(list)
for d, _it, c in window_rows:
    by_day[d].append(c)

days = sorted(by_day.keys())
daily_mean = [stats.fmean(by_day[d]) for d in days]

fig = plt.figure(figsize=(18, 10), dpi=100)
fig.patch.set_facecolor(PAPER)

gs = fig.add_gridspec(2, 1, height_ratios=[1.05, 0.95], hspace=0.28)
ax1 = fig.add_subplot(gs[0])
ax2 = fig.add_subplot(gs[1])
for ax in (ax1, ax2):
    ax.set_facecolor(PAPER)

bins = np.arange(0, 101, 5)
counts, edges = np.histogram(conv_vals, bins=bins)
ymax = max(1, int(counts.max()))

bands = [0.0, p20, p40, p60, p80, 100.0]
for i in range(5):
    left = bands[i]
    right = max(left, bands[i + 1])
    ax1.axvspan(left, right, color=BAND_COLORS[i], alpha=0.85, zorder=0)

ax1.bar(edges[:-1], counts, width=np.diff(edges), align="edge", color=INK, edgecolor=PAPER, linewidth=0.6, zorder=3)
ax1.axvline(latest_conv, color=QC_BLUE, linewidth=2.8, zorder=5)

for x, label in [(p20, "p20"), (p40, "p40"), (p60, "p60"), (p80, "p80")]:
    ax1.axvline(x, color=SOFT, linewidth=1.0, linestyle=(0, (4, 3)), zorder=4)
    ax1.text(x, ymax * 1.04, f"{label} {x:.1f}", ha="center", va="bottom", fontsize=10, color=SOFT)

ax1.set_xlim(0, 100)
ax1.set_ylim(0, ymax * 1.18)
ax1.set_ylabel("Nombre de blocs 4h", color=SOFT, fontsize=11)
ax1.set_xlabel("Indice de convergence (0 a 100)", color=SOFT, fontsize=12, labelpad=10)
ax1.tick_params(colors=SOFT, labelsize=10)
for side in ("top", "right"):
    ax1.spines[side].set_visible(False)
for side in ("left", "bottom"):
    ax1.spines[side].set_color(RULE)

ax1.text(
    0.01,
    1.12,
    "Module 2 - Convergence QC/CAN (distribution roulante)",
    transform=ax1.transAxes,
    fontsize=23,
    fontweight="bold",
    color=INK,
    ha="left",
)
ax1.text(
    0.01,
    1.04,
    "Lecture de discussion: ou se situe le bloc live par rapport aux 30 derniers jours",
    transform=ax1.transAxes,
    fontsize=12.5,
    color=SOFT,
    ha="left",
)

summary = (
    f"Bloc live {latest_date.isoformat()} {latest_interval} UTC  |  "
    f"Convergence {latest_conv:.0f}%  |  Divergence {100-latest_conv:.0f}%  |  "
    f"Percentile {live_pct_rank:.0f}  |  Regime: {regime}"
)
ax1.text(
    0.01,
    0.93,
    summary,
    transform=ax1.transAxes,
    fontsize=11,
    color=CORDOVAN,
    fontweight="bold",
    ha="left",
)

x = np.arange(len(days))
ax2.plot(x, daily_mean, color=INK, linewidth=2.0)
ax2.scatter(x, daily_mean, color=INK, s=16, zorder=3)

latest_day_idx = len(days) - 1
ax2.scatter([latest_day_idx], [daily_mean[-1]], color=QC_BLUE, s=65, zorder=4)
ax2.axhline(stats.fmean(conv_vals), color=SOFT, linestyle=(0, (4, 3)), linewidth=1.0)
ax2.text(0.005, 0.92, f"Moyenne fenetre: {stats.fmean(conv_vals):.1f}%", transform=ax2.transAxes, fontsize=10.5, color=SOFT)

step = max(1, len(days) // 10)
xt = np.arange(0, len(days), step)
ax2.set_xticks(xt)
ax2.set_xticklabels([days[i].strftime("%d/%m") for i in xt])
ax2.set_xlim(0, max(1, len(days) - 1))
ax2.set_ylim(0, 100)
ax2.set_ylabel("Convergence moyenne/jour (%)", color=SOFT, fontsize=11)
ax2.set_xlabel("Derniers jours", color=SOFT, fontsize=12)
ax2.tick_params(colors=SOFT, labelsize=10)
for side in ("top", "right"):
    ax2.spines[side].set_visible(False)
for side in ("left", "bottom"):
    ax2.spines[side].set_color(RULE)

fig.text(
    0.055,
    0.02,
    f"Fenetre analysee: {window_rows[0][0].isoformat()} a {window_rows[-1][0].isoformat()}  |  "
    f"n = {n} blocs 4h  |  Source: vitrine_datamart-headline_events_4h (DEV)",
    fontsize=10.5,
    color="#8A8474",
    ha="left",
)

for out in OUT:
    fig.savefig(out, facecolor=PAPER)
    print(f"wrote {out}")

print(
    "thresholds",
    {
        "p20": round(p20, 2),
        "p40": round(p40, 2),
        "p60": round(p60, 2),
        "p80": round(p80, 2),
        "live": round(latest_conv, 2),
        "live_percentile": round(live_pct_rank, 2),
        "regime": regime,
    },
)

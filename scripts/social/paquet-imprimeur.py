#!/usr/bin/env python3
"""Paquet d'impression des cartes de député.

Deux sorties, à partir des PNG produits par `npm run carte:deputes` :

1. `cartes-imprimeur.pdf` : ce qui part chez l'imprimeur. Une carte par page,
   recto puis verso de chaque carte, à partir de `impression/` (mode
   `--impression` : fond perdu de 3 mm, 856 ppp, page 69,5 x 94,9 mm). Images
   embarquées sans perte (img2pdf), sRGB : la conversion CMJN revient à
   l'imprimeur, sur épreuve.
2. `planche-epreuve.pdf` : l'épreuve maison, à partir des PNG ordinaires (sans
   fond perdu, 428 ppp). Lettre paysage, 8 cartes par page avec repères de
   coupe ; les pages verso sont en miroir horizontal pour un recto verso de
   bureau (retournement sur le bord long). À imprimer à 100 %, jamais « ajuster
   à la page ».

Usage, depuis la racine du dépôt :
  python3 scripts/social/paquet-imprimeur.py [--sortie DOSSIER] [--limite N]
Dépendances : Pillow, img2pdf (pip install --user img2pdf).
"""
import argparse
import glob
import os
import sys

from PIL import Image, ImageDraw

ap = argparse.ArgumentParser()
ap.add_argument("--source", default="social-out/cartes-deputes")
ap.add_argument("--sortie", default="social-out/cartes-deputes/paquet-imprimeur")
ap.add_argument("--limite", type=int, default=None, help="ne prendre que les N premières cartes (essai)")
args = ap.parse_args()
os.makedirs(args.sortie, exist_ok=True)

PPP_ORDINAIRE = 428   # 1071 px = 63,5 mm
PPP_IMPRESSION = 856  # échelle 2 du mode --impression


def paires(dossier):
    rectos = sorted(p for p in glob.glob(os.path.join(dossier, "*.png")) if not p.endswith("-verso.png"))
    if args.limite:
        rectos = rectos[: args.limite]
    out = [(r, r[:-4] + "-verso.png") for r in rectos if os.path.exists(r[:-4] + "-verso.png")]
    if not out:
        sys.exit(f"aucune carte recto-verso dans {dossier}")
    return out


# ── 1. PDF pour l'imprimeur, sans perte ──────────────────────────────────────
impression = os.path.join(args.source, "impression")
if os.path.isdir(impression):
    try:
        import img2pdf
    except ImportError:
        sys.exit("img2pdf manque : pip install --user img2pdf")
    fichiers = [f for r, v in paires(impression) for f in (r, v)]
    with Image.open(fichiers[0]) as im:
        w_mm = im.width / PPP_IMPRESSION * 25.4
        h_mm = im.height / PPP_IMPRESSION * 25.4
    chemin = os.path.join(args.sortie, "cartes-imprimeur.pdf")
    with open(chemin, "wb") as f:
        f.write(img2pdf.convert(fichiers, layout_fun=img2pdf.get_layout_fun((img2pdf.mm_to_pt(w_mm), img2pdf.mm_to_pt(h_mm)))))
    print(f"cartes-imprimeur.pdf : {len(fichiers)} pages de {w_mm:.1f} x {h_mm:.1f} mm (fond perdu compris), sans perte")
else:
    print("pas de dossier impression/ : lancez `npm run carte:deputes -- --impression` pour le PDF de l'imprimeur")

# ── 2. Planche d'épreuve maison ──────────────────────────────────────────────
cartes = paires(args.source)
W, H = 1071, 1496
PW, PH = int(11 * PPP_ORDINAIRE), int(8.5 * PPP_ORDINAIRE)
gap, cols, rows = 60, 4, 2
gx = (PW - cols * W - (cols - 1) * gap) // 2
gy = (PH - rows * H - (rows - 1) * gap) // 2


def planche(images, miroir):
    page = Image.new("RGB", (PW, PH), "white")
    d = ImageDraw.Draw(page)
    m, L = int(0.32 * PPP_ORDINAIRE), int(0.2 * PPP_ORDINAIRE)
    for k, im in enumerate(images):
        row, col = divmod(k, cols)
        if miroir:
            col = cols - 1 - col
        x, y = gx + col * (W + gap), gy + row * (H + gap)
        page.paste(im, (x, y))
        for cx, cy in [(x, y), (x + W, y), (x, y + H), (x + W, y + H)]:
            d.line([(cx - m, cy), (cx - m + L, cy)] if cx == x else [(cx + m - L, cy), (cx + m, cy)], fill="black", width=2)
            d.line([(cx, cy - m), (cx, cy - m + L)] if cy == y else [(cx, cy + m - L), (cx, cy + m)], fill="black", width=2)
    return page


feuilles = []
for i in range(0, len(cartes), cols * rows):
    lot = cartes[i : i + cols * rows]
    feuilles.append(planche([Image.open(r).convert("RGB") for r, _ in lot], miroir=False))
    feuilles.append(planche([Image.open(v).convert("RGB") for _, v in lot], miroir=True))
feuilles[0].save(os.path.join(args.sortie, "planche-epreuve.pdf"), save_all=True, append_images=feuilles[1:], resolution=PPP_ORDINAIRE)
print(f"planche-epreuve.pdf : {len(feuilles)} pages lettre paysage, {len(cartes)} cartes, 8 par page, à imprimer à 100 %")

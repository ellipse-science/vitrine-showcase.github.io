#!/usr/bin/env python3
"""Prépare les portraits de l'ANQ pour les cartes de député.

Deux traitements, parce que l'écran et le papier n'ont pas le même problème.

ÉCRAN — duotone net.
    Le portrait source fait 150 × 200 px et s'affiche autour de 216 px de
    large : on est proche du 1 pour 1. Une trame de similigravure n'apporte
    rien ici et coûte beaucoup, puisqu'elle remplace le détail du visage par
    des points. C'est donc un duotone, redressé et accentué.

IMPRESSION — similigravure.
    Là, il faut monter à 63 mm de large, soit 750 px à 300 ppp : un
    agrandissement de 5×. Un duotone y deviendrait de la bouillie ; un point
    d'encre, lui, grandit proprement. La trame est calculée à la taille
    d'impression, jamais appliquée après coup.

NORMALISATION LOCALE — la partie qui compte.
    Le premier jet appliquait une courbe unique à tous les portraits. En
    comparant les sorties côte à côte, le résultat était sans appel : les
    députés à la peau foncée disparaissaient en aplats d'encre, sans yeux ni
    traits, là où les portraits clairs passaient très bien.
    La cause n'est pas l'étendue GLOBALE des tons — elle va déjà de 0 à 255 sur
    tous les portraits, à cause du costume sombre et du fond clair — mais
    l'étendue LOCALE : sur un visage foncé, le visage n'occupe qu'une bande
    étroite et sombre de cette étendue, que le grossissement de point achevait
    d'écraser.
    On retire donc l'éclairage lent (flou gaussien large) avant de mapper les
    tons, ce qui rend à chaque visage toute la plage disponible quelle que soit
    sa carnation. C'est un traitement par image, pas une courbe unique.

Usage : python3 scripts/build_deputy_cards.py [--force] [--only <slug>]
"""
import argparse
import json
import math
import sys
from pathlib import Path

try:
    import numpy as np
    from PIL import Image, ImageDraw, ImageFilter, ImageOps
except ImportError:  # pragma: no cover
    sys.exit("Pillow et numpy requis : pip install Pillow numpy")

SRC_DIR = Path("public/images/deputes")
SRC_INDEX = SRC_DIR / "index.json"
PRINT_DIR = SRC_DIR / "cartes"
WEB_DIR = PRINT_DIR / "web"

# Écran : 2× la zone photo de la carte (216 × 288 CSS), pour les écrans denses.
WEB_W, WEB_H = 432, 576
# Impression : 63 mm de large à ~300 ppp.
PRINT_W, PRINT_H, PRINT_CELL = 750, 1000, 7

INK = (107, 30, 42)      # --cordovan
PAPER = (243, 236, 221)  # --paper
ANGLE = 45               # angle de trame classique du noir en similigravure

# Réglages calés en comparant les sorties sur des carnations très différentes
# (Bourassa-Sauvé, Viau, Mercier, Pontiac).
BLUR_RADIUS = 28
BLUR_STRENGTH = 0.85
MIDTONE = 138
CONTRAST = 1.18
# Écrête 1 % des noirs et 10 % des blancs : ramène le fond de studio au blanc
# du papier au lieu de le laisser en gris moyen truffé de points.
CLIP_SHADOWS, CLIP_HIGHLIGHTS = 1, 10
# Grossissement de point retombé de 1.45 à 1.18 : au-delà, les tons sombres se
# rejoignent en aplat et le visage se referme.
DOT_GAIN = 1.18


def normalized_gray(src: Image.Image, size: tuple[int, int]) -> Image.Image:
    """Niveaux de gris redressés : éclairage lent retiré, plage rétablie."""
    gray = ImageOps.grayscale(src.resize(size, Image.LANCZOS))
    detail = np.asarray(gray, dtype=np.float32)
    slow = np.asarray(gray.filter(ImageFilter.GaussianBlur(BLUR_RADIUS)), dtype=np.float32)
    out = detail - BLUR_STRENGTH * (slow - MIDTONE)
    out = (out - MIDTONE) * CONTRAST + MIDTONE
    gray = Image.fromarray(np.clip(out, 0, 255).astype(np.uint8))
    return ImageOps.autocontrast(gray, cutoff=(CLIP_SHADOWS, CLIP_HIGHLIGHTS))


def web_duotone(src: Image.Image) -> Image.Image:
    gray = normalized_gray(src, (WEB_W, WEB_H))
    # L'accentuation compense l'agrandissement depuis 150 px de large.
    gray = gray.filter(ImageFilter.UnsharpMask(radius=2, percent=95, threshold=3))
    return ImageOps.colorize(gray, black=INK, white=PAPER)


def print_halftone(src: Image.Image) -> Image.Image:
    """Trame de similigravure : un point d'encre par cellule, rayon ∝ noirceur."""
    gray = normalized_gray(src, (PRINT_W, PRINT_H))
    px = gray.load()

    mask = Image.new("L", (PRINT_W, PRINT_H), 0)
    draw = ImageDraw.Draw(mask)

    # Grille pivotée : on balaie sur la diagonale pour couvrir toute l'image.
    reach = int(math.hypot(PRINT_W, PRINT_H)) // (2 * PRINT_CELL) + 2
    rad = math.radians(ANGLE)
    cos_a, sin_a = math.cos(rad), math.sin(rad)
    cx, cy = PRINT_W / 2, PRINT_H / 2

    for iy in range(-reach, reach + 1):
        for ix in range(-reach, reach + 1):
            u, v = ix * PRINT_CELL, iy * PRINT_CELL
            x = cx + u * cos_a - v * sin_a
            y = cy + u * sin_a + v * cos_a
            if not (0 <= x < PRINT_W and 0 <= y < PRINT_H):
                continue
            # Aire du point ∝ noirceur, donc rayon ∝ racine carrée.
            darkness = 1.0 - px[int(x), int(y)] / 255.0
            r = (PRINT_CELL / 2) * math.sqrt(max(0.0, darkness)) * DOT_GAIN
            if r > 0.35:
                draw.ellipse([x - r, y - r, x + r, y + r], fill=255)

    # Points opaques sur fond transparent : la couleur du carton passe au
    # travers, et le PNG palettisé reste léger là où un JPEG de trame explose.
    card = Image.new("RGBA", (PRINT_W, PRINT_H), INK + (0,))
    card.putalpha(mask)
    return card


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--force", action="store_true", help="regénère même si la sortie existe")
    ap.add_argument("--only", help="ne traiter qu'un slug de circonscription (mise au point)")
    args = ap.parse_args()

    if not SRC_INDEX.exists():
        sys.exit(f"{SRC_INDEX} absent : lancer d'abord scripts/scrape_deputy_photos.py")

    deputes = json.loads(SRC_INDEX.read_text(encoding="utf-8"))["deputes"]
    PRINT_DIR.mkdir(parents=True, exist_ok=True)
    WEB_DIR.mkdir(parents=True, exist_ok=True)

    written = skipped = missing = 0
    for dep in deputes:
        riding_slug = dep["circonscription_slug"]
        asset_slug = dep.get("asset_slug", riding_slug)
        if args.only and args.only not in (asset_slug, riding_slug, str(dep.get("deputy_id", ""))):
            continue
        src_path = SRC_DIR / f"{asset_slug}.jpg"
        web_path = WEB_DIR / f"{asset_slug}.jpg"
        print_path = PRINT_DIR / f"{asset_slug}.png"
        web_path.parent.mkdir(parents=True, exist_ok=True)
        print_path.parent.mkdir(parents=True, exist_ok=True)
        if not src_path.exists():
            print(f"  manquant : {asset_slug}")
            missing += 1
            continue
        if web_path.exists() and print_path.exists() and not args.force:
            skipped += 1
            continue
        with Image.open(src_path) as im:
            rgb = im.convert("RGB")
            web_duotone(rgb).save(web_path, format="JPEG", quality=86,
                                  optimize=True, progressive=True)
            print_halftone(rgb).save(print_path, format="PNG", optimize=True)
        written += 1
        print(f"  {asset_slug}  ecran {web_path.stat().st_size / 1024:.0f} Ko"
              f"  impression {print_path.stat().st_size / 1024:.0f} Ko")

    web_mb = sum(f.stat().st_size for f in WEB_DIR.rglob("*.jpg")) / 1048576
    print_mb = sum(f.stat().st_size for f in PRINT_DIR.rglob("*.png")) / 1048576
    print(f"\n{written} générés, {skipped} déjà là, {missing} sans source"
          f" — écran {web_mb:.1f} Mo, impression {print_mb:.1f} Mo")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

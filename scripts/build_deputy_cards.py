#!/usr/bin/env python3
"""Convertit les portraits de l'ANQ en trames d'impression pour les cartes.

Pourquoi une trame plutôt que la photo telle quelle : l'ANQ ne sert qu'un
seul format, 150 × 200 px (vérifié en sondant les autres valeurs du paramètre
`process`, qui retournent toutes du 60 × 80). À 300 ppp, ce portrait couvre
13 × 17 mm, soit un timbre — impossible d'en tirer la photo d'une carte de
63 × 89 mm sans bouillie de pixels.

Une trame de similigravure résout les deux problèmes d'un coup :

  1. c'est le rendu authentique des cartes de collection d'époque, imprimées
     en points d'encre visibles sur carton bon marché ;
  2. un point d'encre s'agrandit proprement là où un pixel s'étire. La trame
     est calculée À LA TAILLE D'IMPRESSION (750 × 1000 px, soit ~300 ppp sur
     la zone photo de la carte), pas appliquée après coup comme un filtre CSS.

Sortie : PNG RVBA, points opaques sur fond transparent. Le fond transparent
laisse la couleur du carton passer au travers, et le PNG palettisé pèse ~26 Ko
là où un JPEG de trame en pèserait dix fois plus (une trame est du détail haute
fréquence, ce que JPEG compresse très mal).

Usage : python3 scripts/build_deputy_cards.py [--force]
"""
import argparse
import json
import math
import sys
from pathlib import Path

try:
    from PIL import Image, ImageDraw, ImageEnhance, ImageOps
except ImportError:  # pragma: no cover
    sys.exit("Pillow requis : pip install Pillow")

SRC_DIR = Path("public/images/deputes")
SRC_INDEX = SRC_DIR / "index.json"
OUT_DIR = SRC_DIR / "cartes"
WEB_DIR = OUT_DIR / "web"

# Deux tirages, parce qu'une trame ne se redimensionne pas comme une photo.
#
#   impression — 63 mm de large à ~300 ppp.
#   écran      — la carte fait ~162 px de large dans le navigateur. Réduire le
#                fichier d'impression jusque-là fait battre la grille de points
#                contre la grille de pixels : moirage en damier, visages
#                illisibles. Le tirage écran est donc tramé À SA taille, avec
#                un pas plus large, pour que les points restent des points.
PRINT_W, PRINT_H, PRINT_CELL = 750, 1000, 7
WEB_W, WEB_H, WEB_CELL = 336, 448, 6
INK = (107, 30, 42)  # --cordovan
ANGLE = 45           # angle de trame classique du noir en similigravure
CONTRAST = 1.15      # le portrait officiel est plat ; la trame mange le contraste


def halftone(src: Image.Image, cell: int, out_w: int, out_h: int) -> Image.Image:
    """Trame de similigravure : un point d'encre par cellule, rayon ∝ noirceur."""
    gray = ImageOps.grayscale(src).resize((out_w, out_h), Image.LANCZOS)
    gray = ImageEnhance.Contrast(gray).enhance(CONTRAST)
    px = gray.load()

    mask = Image.new("L", (out_w, out_h), 0)
    draw = ImageDraw.Draw(mask)

    # La grille est pivotée, donc on la balaie sur la diagonale pour couvrir
    # toute l'image quel que soit l'angle.
    reach = int(math.hypot(out_w, out_h)) // (2 * cell) + 2
    rad = math.radians(ANGLE)
    cos_a, sin_a = math.cos(rad), math.sin(rad)
    cx, cy = out_w / 2, out_h / 2

    for iy in range(-reach, reach + 1):
        for ix in range(-reach, reach + 1):
            u, v = ix * cell, iy * cell
            x = cx + u * cos_a - v * sin_a
            y = cy + u * sin_a + v * cos_a
            if not (0 <= x < out_w and 0 <= y < out_h):
                continue
            # Aire du point ∝ noirceur, donc rayon ∝ racine carrée. Le 1.45
            # laisse les points les plus sombres se toucher (aplat d'encre).
            darkness = 1.0 - px[int(x), int(y)] / 255.0
            r = (cell / 2) * math.sqrt(max(0.0, darkness)) * 1.45
            if r > 0.35:
                draw.ellipse([x - r, y - r, x + r, y + r], fill=255)

    card = Image.new("RGBA", (out_w, out_h), INK + (0,))
    card.putalpha(mask)
    return card


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--force", action="store_true", help="regénère même si la sortie existe")
    args = ap.parse_args()

    if not SRC_INDEX.exists():
        sys.exit(f"{SRC_INDEX} absent : lancer d'abord scripts/scrape_deputy_photos.py")

    deputes = json.loads(SRC_INDEX.read_text(encoding="utf-8"))["deputes"]
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    WEB_DIR.mkdir(parents=True, exist_ok=True)

    written = skipped = missing = 0
    total_bytes = 0
    for dep in deputes:
        slug = dep["circonscription_slug"]
        src_path = SRC_DIR / f"{slug}.jpg"
        out_path = OUT_DIR / f"{slug}.png"
        web_path = WEB_DIR / f"{slug}.png"
        if not src_path.exists():
            print(f"  manquant : {slug}")
            missing += 1
            continue
        if out_path.exists() and web_path.exists() and not args.force:
            skipped += 1
            total_bytes += out_path.stat().st_size + web_path.stat().st_size
            continue
        with Image.open(src_path) as im:
            rgb = im.convert("RGB")
            halftone(rgb, PRINT_CELL, PRINT_W, PRINT_H).save(out_path, format="PNG", optimize=True)
            halftone(rgb, WEB_CELL, WEB_W, WEB_H).save(web_path, format="PNG", optimize=True)
        total_bytes += out_path.stat().st_size + web_path.stat().st_size
        written += 1
        print(f"  {slug}  impression {out_path.stat().st_size / 1024:.0f} Ko"
              f"  ecran {web_path.stat().st_size / 1024:.0f} Ko")

    web_bytes = sum(f.stat().st_size for f in WEB_DIR.glob("*.png"))
    print(f"\n{written} générés, {skipped} déjà là, {missing} sans source "
          f"— {total_bytes / 1048576:.1f} Mo au total dans {OUT_DIR} "
          f"(dont {web_bytes / 1048576:.1f} Mo de tirage écran)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

#!/usr/bin/env python3
"""Fabrique les icônes Android à partir du logo du site.

    python3 android/generer-icones.py

POURQUOI un script et pas des PNG déposés à la main : l'icône doit rester
dérivable du logo. Le jour où `public/android-chrome-512x512.png` change, on
relance ceci plutôt que de retoucher des images dont plus personne ne sait d'où
elles viennent. Même raison que `ios/generer-icone.py`.

Ce que produit ce script :
  - l'avant-plan de l'icône adaptative (`ic_launcher_foreground.png`), le logo
    tenant dans la zone sûre centrale, puisque le lanceur peut la rogner en
    rond, en carré arrondi ou en écusson selon le fabricant ;
  - les icônes héritées, carrées et rondes, aux cinq densités ;
  - l'icône 512x512 exigée par la fiche du Play Store.

⚠️ La source disponible est en 512 px : les tailles au-delà sont INTERPOLÉES.
Pour une publication, exporter un rendu natif depuis le fichier vectoriel.
"""

from pathlib import Path

from PIL import Image, ImageDraw

RACINE = Path(__file__).resolve().parent.parent
SOURCE = RACINE / "public" / "android-chrome-512x512.png"
RES = RACINE / "android" / "app" / "src" / "main" / "res"

FOND = (250, 244, 232)  # @color/fond, le papier crème du site

# Densités Android pour une icône de lanceur de 48 dp.
DENSITES = {"mdpi": 48, "hdpi": 72, "xhdpi": 96, "xxhdpi": 144, "xxxhdpi": 192}

# L'avant-plan adaptatif fait 108 dp, dont seuls les 72 dp centraux sont sûrs.
COTE_ADAPTATIF = 432
PROPORTION_SURE = 72 / 108 * 0.92  # petite marge en plus


def logo(taille: int) -> Image.Image:
    im = Image.open(SOURCE).convert("RGBA")
    return im.resize((taille, taille), Image.LANCZOS)


def sur_fond(cote: int, proportion: float, rond: bool = False) -> Image.Image:
    fond = Image.new("RGBA", (cote, cote), FOND + (255,))
    cote_logo = max(1, int(cote * proportion))
    decalage = (cote - cote_logo) // 2
    fond.paste(logo(cote_logo), (decalage, decalage), logo(cote_logo))
    if rond:
        masque = Image.new("L", (cote, cote), 0)
        ImageDraw.Draw(masque).ellipse((0, 0, cote - 1, cote - 1), fill=255)
        decoupe = Image.new("RGBA", (cote, cote), (0, 0, 0, 0))
        decoupe.paste(fond, (0, 0), masque)
        return decoupe
    return fond


def ecrire(image: Image.Image, chemin: Path, avec_alpha: bool) -> None:
    chemin.parent.mkdir(parents=True, exist_ok=True)
    image.save(chemin, format="PNG") if avec_alpha else image.convert("RGB").save(chemin, "PNG")


def main() -> None:
    if not SOURCE.exists():
        raise SystemExit(f"logo introuvable : {SOURCE}")

    ecrits = []

    # Avant-plan adaptatif : transparent, le fond vient de la couleur déclarée
    # dans ic_launcher_background.
    avant = Image.new("RGBA", (COTE_ADAPTATIF, COTE_ADAPTATIF), (0, 0, 0, 0))
    cote_logo = int(COTE_ADAPTATIF * PROPORTION_SURE)
    decalage = (COTE_ADAPTATIF - cote_logo) // 2
    avant.paste(logo(cote_logo), (decalage, decalage), logo(cote_logo))
    cible = RES / "drawable" / "ic_launcher_foreground.png"
    ecrire(avant, cible, avec_alpha=True)
    ecrits.append(cible)

    # Icônes héritées, pour les lanceurs qui ne suivent pas l'icône adaptative.
    for densite, cote in DENSITES.items():
        for nom, rond in (("ic_launcher", False), ("ic_launcher_round", True)):
            cible = RES / f"mipmap-{densite}" / f"{nom}.png"
            ecrire(sur_fond(cote, 0.82, rond), cible, avec_alpha=True)
            ecrits.append(cible)

    # Fiche du Play Store : 512x512, sans transparence.
    cible = RACINE / "android" / "play-icone-512.png"
    ecrire(sur_fond(512, 0.82), cible, avec_alpha=False)
    ecrits.append(cible)

    for c in ecrits:
        im = Image.open(c)
        print(f"  {im.size[0]:>3}x{im.size[1]:<3} {im.mode:<5} {c.relative_to(RACINE)}")
    print(f"\n{len(ecrits)} fichiers écrits")


if __name__ == "__main__":
    main()

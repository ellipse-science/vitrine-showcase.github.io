#!/usr/bin/env python3
"""Fabrique l'icône de l'application à partir du logo du site.

    python3 ios/generer-icone.py

POURQUOI un script et pas un PNG déposé à la main : l'icône doit rester
dérivable du logo. Le jour où `public/android-chrome-512x512.png` change, on
relance ceci plutôt que de retoucher une image dont plus personne ne sait d'où
elle vient.

Deux contraintes de l'App Store que ce script applique :
  - 1024x1024 exactement ;
  - AUCUNE couche alpha. Un PNG transparent fait rejeter l'envoi par
    App Store Connect, avec un message peu explicite.

⚠️ La source disponible est en 512 px : l'agrandissement en 1024 est
INTERPOLÉ, donc légèrement mou sur les traits fins du monogramme. Pour une
publication publique, exporter un 1024 natif depuis le fichier vectoriel
d'origine et le déposer à la place de la sortie de ce script.
"""

from pathlib import Path

from PIL import Image

RACINE = Path(__file__).resolve().parent.parent
SOURCE = RACINE / "public" / "android-chrome-512x512.png"
CIBLE = RACINE / "ios" / "Vitrine" / "Assets.xcassets" / "AppIcon.appiconset" / "icone-1024.png"

COTE = 1024
# Le logo touche presque les bords ; iOS masque l'icône en carré à coins
# arrondis. Sans cette marge, la pointe gauche du triangle serait rognée.
PROPORTION = 0.82
FOND = (255, 255, 255)


def main() -> None:
    if not SOURCE.exists():
        raise SystemExit(f"logo introuvable : {SOURCE}")

    logo = Image.open(SOURCE).convert("RGBA")
    cote_logo = int(COTE * PROPORTION)
    logo = logo.resize((cote_logo, cote_logo), Image.LANCZOS)

    # Fond opaque : c'est lui qui supprime la couche alpha.
    icone = Image.new("RGB", (COTE, COTE), FOND)
    decalage = (COTE - cote_logo) // 2
    icone.paste(logo, (decalage, decalage), logo)

    CIBLE.parent.mkdir(parents=True, exist_ok=True)
    icone.save(CIBLE, format="PNG")

    controle = Image.open(CIBLE)
    print(f"écrit   : {CIBLE.relative_to(RACINE)}")
    print(f"taille  : {controle.size[0]}x{controle.size[1]}")
    print(f"mode    : {controle.mode} (doit être RGB, sans alpha)")


if __name__ == "__main__":
    main()

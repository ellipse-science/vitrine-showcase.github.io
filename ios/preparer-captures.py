#!/usr/bin/env python3
"""Met des captures d'écran d'iPhone aux dimensions exigées par l'App Store.

    python3 ios/preparer-captures.py ~/Photos/capture*.png

Les images prêtes atterrissent dans `ios/captures-appstore/`.

POURQUOI ce script : App Store Connect REFUSE le téléversement, avant même
l'examen, si une capture ne tombe pas au pixel près sur une dimension acceptée.
Or un iPhone ordinaire ne produit pas ces dimensions : seuls les modèles Pro Max
et Air le font. Redimensionner à la main dans un éditeur d'images est faisable,
mais c'est exactement le genre de tâche répétitive qu'on rate une fois sur cinq.

Apple ne demande plus qu'UNE famille de tailles pour un iPhone : la classe
6,9 pouces. Les listes des appareils plus petits en sont dérivées
automatiquement. L'application ne visant que l'iPhone
(`TARGETED_DEVICE_FAMILY = 1`), aucune capture d'iPad n'est requise.

⚠️ Les captures doivent montrer l'application RÉELLE, pas une maquette ni une
page web photographiée. Prenez-les depuis l'application installée par
TestFlight, sur votre appareil.
"""

import sys
from pathlib import Path

from PIL import Image

# Dimension retenue : celle des iPhone 16/17 Pro Max. Les deux autres tailles
# acceptées pour la classe 6,9 po sont 1290x2796 et 1260x2736 (iPhone Air).
LARGEUR, HAUTEUR = 1320, 2868

SORTIE = Path(__file__).resolve().parent / "captures-appstore"


def preparer(source: Path) -> Path:
    image = Image.open(source).convert("RGB")

    # Mise à l'échelle « couvrante » puis recadrage centré. Les proportions d'un
    # iPhone récent sont très proches de la cible (0,461 contre 0,460) : le
    # recadrage retire quelques pixels, jamais un bout d'interface.
    facteur = max(LARGEUR / image.width, HAUTEUR / image.height)
    intermediaire = image.resize(
        (round(image.width * facteur), round(image.height * facteur)),
        Image.LANCZOS,
    )
    gauche = (intermediaire.width - LARGEUR) // 2
    haut = (intermediaire.height - HAUTEUR) // 2
    finale = intermediaire.crop((gauche, haut, gauche + LARGEUR, haut + HAUTEUR))

    SORTIE.mkdir(parents=True, exist_ok=True)
    cible = SORTIE / f"{source.stem}-{LARGEUR}x{HAUTEUR}.png"
    finale.save(cible, format="PNG")
    return cible


def main() -> None:
    sources = [Path(a) for a in sys.argv[1:]]
    if not sources:
        raise SystemExit(__doc__)

    manquantes = [s for s in sources if not s.exists()]
    if manquantes:
        raise SystemExit("introuvable : " + ", ".join(str(m) for m in manquantes))

    if len(sources) > 10:
        raise SystemExit(f"App Store Connect accepte 10 captures au maximum, {len(sources)} fournies")

    for source in sources:
        avant = Image.open(source).size
        cible = preparer(source)
        apres = Image.open(cible).size
        print(f"{source.name}  {avant[0]}x{avant[1]} -> {apres[0]}x{apres[1]}  {cible.name}")

    print(f"\n{len(sources)} capture(s) dans {SORTIE}")
    print("Téléverser dans App Store Connect > l'application > Aperçus et captures d'écran")


if __name__ == "__main__":
    main()

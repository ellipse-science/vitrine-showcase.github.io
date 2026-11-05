# Guide des catégories d'enjeux

Source unique des catégories d'enjeux du CAPP, de leurs règles de codage et de leurs écarts connus. Le guide sert d'étalon : il prévaut pour le codage humain.

| Fichier | Contenu |
|---|---|
| `guide_categories_enjeux_fr.qmd` | Guide en français |
| `guide_categories_enjeux_en.qmd` | Guide en anglais |

Les deux fichiers doivent garder les mêmes codes et les mêmes règles : le workflow le vérifie.

## Publication

1. Une PR modifie un `.qmd`. Le workflow `guide-enjeux.yml` génère les PDF, sans les publier.
2. Au merge sur `develop`, il les écrit dans `public/data/guide-enjeux/`.
3. La synchro aux 4 heures de `refresh-data.yml` copie `public/data/` vers la production.

Les PDF sont donc à jour sur le site au plus tard 4 heures après le merge :

- <https://vitrinedemocratique.com/data/guide-enjeux/guide_categories_enjeux_fr.pdf>
- <https://vitrinedemocratique.com/data/guide-enjeux/guide_categories_enjeux_en.pdf>

La Trousse étudiante du CAPP pointe vers ces deux adresses. Ne déposez pas de PDF à la main.

## Générer les PDF en local

```bash
quarto render guide_categories_enjeux_fr.qmd --to pdf
quarto render guide_categories_enjeux_en.qmd --to pdf
```

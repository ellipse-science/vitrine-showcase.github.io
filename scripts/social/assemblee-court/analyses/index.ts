// Les analyses des reels courts de « L'alignement de l'Assemblée ». Une analyse
// qui ne s'applique pas aux données rend `null` et disparaît de la liste.

import type { Analyse } from "../plan";

import { chefs } from "./chefs";

export const ANALYSES: Analyse[] = [chefs];

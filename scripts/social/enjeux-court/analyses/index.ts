// Les analyses des reels courts des « 12 enjeux », dans l'ordre où elles sont
// proposées. Une analyse qui ne s'applique pas aux données du jour rend `null`
// et disparaît de la liste : on ne force jamais une histoire.
//
// « Ce qui domine » est un GABARIT décliné sur les trois périodes du module —
// jour, semaine, campagne — sous les mots du site (Jules Piral, 2026-09-18).

import type { Analyse } from "../plan";

import { bond } from "./bond";
import { domine } from "./domine";

export const ANALYSES: Analyse[] = [
  domine("day"),
  domine("week"),
  domine("month"),
  bond,
];

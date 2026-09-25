// Les analyses des reels courts de « La Une des Unes », dans l'ordre où elles
// sont proposées. Une analyse qui ne s'applique pas aux données du jour rend
// `null` et disparaît de la liste : on ne force jamais une histoire.

import type { Analyse } from "../plan";

import { bond } from "./bond";
import { part } from "./part";
import { tenue } from "./tenue";

export const ANALYSES: Analyse[] = [bond, part, tenue];

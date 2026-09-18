// Les analyses des reels courts des « 12 enjeux », dans l'ordre où elles sont
// proposées. Une analyse qui ne s'applique pas aux données du jour rend `null`
// et disparaît de la liste : on ne force jamais une histoire.

import type { Analyse } from "../plan";

import { bond } from "./bond";
import { domine } from "./domine";
import { grimpe } from "./grimpe";

export const ANALYSES: Analyse[] = [domine, bond, grimpe];

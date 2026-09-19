// Les analyses des reels courts, dans l'ordre où on les propose.
import { bascule } from "./analyses/bascule";
import { calendrier } from "./analyses/calendrier";
import { horloge } from "./analyses/horloge";
import { medias } from "./analyses/medias";
import { multiple } from "./analyses/multiple";
import { oublie } from "./analyses/oublie";
import { record } from "./analyses/record";
import { remontee } from "./analyses/remontee";
import { reunis } from "./analyses/reunis";
import { ton } from "./analyses/ton";
import type { Analyse } from "./plan";

export const ANALYSES: Analyse[] = [record, reunis, horloge, bascule, calendrier, ton, medias, oublie, remontee, multiple];

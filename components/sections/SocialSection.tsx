import { loadSocial } from "@/lib/data/social";
import { SocialClient } from "@/components/interactive/SocialClient";

// Module expérimental « La guerre des clics », affiché en dev comme en prod.
// Ses tables n'existent que dans le datamart DEV (raffineur agora-social) : le
// chargeur lit donc toujours les fichiers publiés du dépôt, jamais l'API. Sans
// fichier, il rend `null` et la section ne s'affiche pas.
export async function SocialSection() {
  const data = await loadSocial();
  if (!data) return null;
  // L'activité par compte et par jour reste hors des props (fichier statique
  // reseaux/audience-jour.json, chargé à la demande) ; le client sait seulement
  // qu'elle existe.
  const { audienceJour, ...reste } = data;
  return <SocialClient data={{ ...reste, audienceJour: [], audienceJourDispo: audienceJour.length > 0 }} />;
}

import { loadSocial } from "@/lib/data/social";
import { SocialClient } from "@/components/interactive/SocialClient";

// Module EXPÉRIMENTAL, dev seulement : ses tables n'existent que dans le
// datamart DEV (raffineur agora-social). La section se garde elle-même en
// prod, et app/page.tsx retire aussi son enveloppe.
const isProd = process.env.NEXT_PUBLIC_SITE_ENV === "prod";

export async function SocialSection() {
  if (isProd) return null;
  const data = await loadSocial();
  if (!data) return null;
  // L'activité par compte et par jour reste hors des props (fichier statique
  // reseaux/audience-jour.json, chargé à la demande) ; le client sait seulement
  // qu'elle existe.
  const { audienceJour, ...reste } = data;
  return <SocialClient data={{ ...reste, audienceJour: [], audienceJourDispo: audienceJour.length > 0 }} />;
}

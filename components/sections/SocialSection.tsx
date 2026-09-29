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
  return <SocialClient data={data} />;
}

import { Banc, blocsDuSnapshot } from "./lib";

// Racine du banc : l'édition la plus récente de l'instantané.
export default async function Page() {
  const blocs = await blocsDuSnapshot();
  return <Banc bloc={blocs[blocs.length - 1]} />;
}

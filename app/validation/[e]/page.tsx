import { Banc, blocsDuSnapshot } from "../lib";

export async function generateStaticParams() {
  return (await blocsDuSnapshot()).map((e) => ({ e }));
}

export default async function Page({ params }: { params: Promise<{ e: string }> }) {
  const { e } = await params;
  return <Banc bloc={e} />;
}

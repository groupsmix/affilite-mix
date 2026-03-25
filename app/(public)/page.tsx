import { getCurrentSite } from "@/lib/site-context";

export default async function HomePage() {
  const site = await getCurrentSite();

  return (
    <div className="mx-auto max-w-4xl px-4 py-16 text-center">
      <h1 className="mb-4 text-4xl font-bold">{site.name}</h1>
      <p className="text-lg text-gray-600">{site.brand.description}</p>
      <p className="mt-8 text-sm text-gray-400">
        NicheHub Platform — Phase A scaffold
      </p>
    </div>
  );
}

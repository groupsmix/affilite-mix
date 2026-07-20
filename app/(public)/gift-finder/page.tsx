import { getCurrentSite } from "@/lib/site-context";
import { GiftFinderQuiz } from "./gift-finder-quiz";
import { JsonLd, breadcrumbJsonLd } from "../components/json-ld";

export default async function GiftFinderPage() {
  const site = await getCurrentSite();
  const breadcrumbs = breadcrumbJsonLd(site, [
    { name: site.name, path: "/" },
    { name: site.language === "ar" ? "مُجدّي الهدايا" : "Gift Finder", path: "/gift-finder" },
  ]);

  return (
    <>
      <JsonLd data={breadcrumbs} />
      <GiftFinderQuiz
        productLabel={site.productLabel}
        productLabelPlural={site.productLabelPlural}
        language={site.language ?? "en"}
      />
    </>
  );
}

import { getCurrentSite } from "@/lib/site-context";
import { GiftFinderQuiz } from "./gift-finder-quiz";

export default async function GiftFinderPage() {
  const site = await getCurrentSite();
  return (
    <GiftFinderQuiz
      productLabel={site.productLabel}
      productLabelPlural={site.productLabelPlural}
    />
  );
}

import type { Metadata } from "next";
import {
  TaxonomyIndexPage,
  generateTaxonomyIndexMetadata,
} from "../components/taxonomy-index-page";

const CONFIG = {
  prefix: "occasion",
  label: "Shop by Occasion",
  taxonomyType: "occasion" as const,
  description: "Every occasion calls for a different watch. Browse our curated gift guides for each special moment.",
};

export const revalidate = 60;

export async function generateMetadata(): Promise<Metadata> {
  return generateTaxonomyIndexMetadata(CONFIG);
}

export default async function OccasionIndexPage() {
  return <TaxonomyIndexPage config={CONFIG} />;
}

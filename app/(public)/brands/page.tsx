import type { Metadata } from "next";
import {
  TaxonomyIndexPage,
  generateTaxonomyIndexMetadata,
} from "../components/taxonomy-index-page";

const CONFIG = {
  prefix: "brands",
  label: "Watch Brands",
  taxonomyType: "brand" as const,
  description: "Explore our curated collection of watch brands. From heritage Swiss makers to Japanese innovators.",
};

export const revalidate = 60;

export async function generateMetadata(): Promise<Metadata> {
  return generateTaxonomyIndexMetadata(CONFIG);
}

export default async function BrandsIndexPage() {
  return <TaxonomyIndexPage config={CONFIG} />;
}

import type { Metadata } from "next";
import {
  TaxonomyIndexPage,
  generateTaxonomyIndexMetadata,
} from "../components/taxonomy-index-page";

const CONFIG = {
  prefix: "budget",
  label: "Shop by Budget",
  taxonomyType: "budget" as const,
  description: "Find the perfect watch gift at every price point. Browse our curated collections by budget range.",
};

export const revalidate = 60;

export async function generateMetadata(): Promise<Metadata> {
  return generateTaxonomyIndexMetadata(CONFIG);
}

export default async function BudgetIndexPage() {
  return <TaxonomyIndexPage config={CONFIG} />;
}

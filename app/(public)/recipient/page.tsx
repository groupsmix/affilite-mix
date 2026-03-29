import type { Metadata } from "next";
import {
  TaxonomyIndexPage,
  generateTaxonomyIndexMetadata,
} from "../components/taxonomy-index-page";

const CONFIG = {
  prefix: "recipient",
  label: "Gifts by Recipient",
  taxonomyType: "recipient" as const,
  description: "Find the perfect watch gift for anyone on your list. Browse our curated picks by recipient.",
};

export const revalidate = 60;

export async function generateMetadata(): Promise<Metadata> {
  return generateTaxonomyIndexMetadata(CONFIG);
}

export default async function RecipientIndexPage() {
  return <TaxonomyIndexPage config={CONFIG} />;
}

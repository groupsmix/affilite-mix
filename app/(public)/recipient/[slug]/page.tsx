import type { Metadata } from "next";
import {
  TaxonomyPage,
  generateTaxonomyMetadata,
  generateTaxonomyStaticParams,
  TAXONOMY_REVALIDATE,
} from "../../components/taxonomy-page";

const CONFIG = { prefix: "recipient", label: "Gifts by Recipient" } as const;

export const revalidate = TAXONOMY_REVALIDATE;

interface PageProps {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ page?: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  return generateTaxonomyMetadata(CONFIG, { params });
}

export default async function RecipientPage({ params, searchParams }: PageProps) {
  return <TaxonomyPage config={CONFIG} params={params} searchParams={searchParams} />;
}

export const generateStaticParams = generateTaxonomyStaticParams;

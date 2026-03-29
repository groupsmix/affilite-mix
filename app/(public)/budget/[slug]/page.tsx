import type { Metadata } from "next";
import {
  TaxonomyPage,
  generateTaxonomyMetadata,
  generateTaxonomyStaticParams,
} from "../../components/taxonomy-page";

const CONFIG = { prefix: "budget", label: "Shop by Budget" } as const;

/** ISR: revalidate every 60 seconds */
export const revalidate = 60;

interface PageProps {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ page?: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  return generateTaxonomyMetadata(CONFIG, { params });
}

export default async function BudgetPage({ params, searchParams }: PageProps) {
  return <TaxonomyPage config={CONFIG} params={params} searchParams={searchParams} />;
}

export const generateStaticParams = generateTaxonomyStaticParams;

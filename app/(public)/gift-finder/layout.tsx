import type { Metadata } from "next";
import { getCurrentSite } from "@/lib/site-context";
import { notFound } from "next/navigation";

export async function generateMetadata(): Promise<Metadata> {
  const site = await getCurrentSite();
  if (!site.features.giftFinder) return {};
  return {
    title: `Gift Finder Quiz — ${site.name}`,
    description: `Answer 4 quick questions and we'll recommend the perfect ${site.productLabel.toLowerCase()} gift. Personalized picks by budget, occasion, recipient, and style.`,
    openGraph: {
      title: `Gift Finder Quiz — Find the Perfect ${site.productLabel} in 60 Seconds`,
      description: `Not sure which ${site.productLabel.toLowerCase()} to get? Our free Gift Finder Quiz matches you with the best pick based on your budget, occasion, and style.`,
      url: `https://${site.domain}/gift-finder`,
      siteName: site.name,
    },
    twitter: {
      card: "summary_large_image",
      title: `Gift Finder Quiz — Find the Perfect ${site.productLabel} in 60 Seconds`,
      description: `Not sure which ${site.productLabel.toLowerCase()} to get? Our free Gift Finder Quiz matches you with the best pick based on your budget, occasion, and style.`,
    },
    alternates: {
      canonical: `https://${site.domain}/gift-finder`,
    },
  };
}

export default async function GiftFinderLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const site = await getCurrentSite();
  if (!site.features.giftFinder) notFound();
  return <>{children}</>;
}

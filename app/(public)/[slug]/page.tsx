import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getCurrentSite } from "@/lib/site-context";
import { getDialGuide } from "@/lib/dial-guides";
import { getDialHomepageConfig } from "@/lib/dial-config";
import { GuideArticle } from "../components/article/guide-article";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const site = await getCurrentSite();
  const guide = getDialGuide(slug);
  if (!guide || site.homepageTemplate !== "dial") {
    return { title: "Not Found" };
  }
  const url = `https://${site.domain}/${guide.slug}`;
  return {
    metadataBase: new URL(`https://${site.domain}`),
    title: guide.meta.title,
    description: guide.meta.description,
    alternates: { canonical: url },
    openGraph: {
      title: guide.meta.title,
      description: guide.meta.description,
      url,
      siteName: site.name,
      locale: site.locale,
      type: "article",
    },
  };
}

export default async function DialGuideRootPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const site = await getCurrentSite();
  const guide = getDialGuide(slug);

  if (!guide || site.homepageTemplate !== "dial") {
    notFound();
  }

  const dialConfig = await getDialHomepageConfig(site.id);
  return <GuideArticle guide={guide} siteName={site.name} watches={dialConfig.watches} />;
}

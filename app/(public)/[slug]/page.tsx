import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getCurrentSite } from "@/lib/site-context";
import { getDialGuide } from "@/lib/dial-guides";
import { getDialHomepageConfig } from "@/lib/dial-config";
import { getCalmPost } from "@/lib/calmroutine";
import { GuideArticle } from "../components/article/guide-article";
import { ContentTypeListing } from "./content-type-listing";
import { CalmShell } from "../components/calmroutine/shell";
import { CalmPostView } from "../components/calmroutine/post-view";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const site = await getCurrentSite();

  const calmPost = site.slug === "calm-routine" ? getCalmPost(slug) : undefined;
  if (calmPost) {
    const url = `https://${site.domain}/${calmPost.slug}`;
    return {
      metadataBase: new URL(`https://${site.domain}`),
      title: calmPost.seoTitle,
      description: calmPost.seoDescription,
      alternates: { canonical: url },
      openGraph: {
        title: calmPost.seoTitle,
        description: calmPost.seoDescription,
        url,
        siteName: site.name,
        locale: site.locale,
        type: "article",
      },
    };
  }

  const guide = getDialGuide(slug);
  if (guide && site.homepageTemplate === "dial") {
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

  const ct = site.contentTypes.find((c) => c.value === slug);
  if (ct) {
    const url = `https://${site.domain}/${slug}`;
    const plural = ct.labelPlural ?? `${ct.label}s`;
    const description = `Browse all ${plural.toLowerCase()} on ${site.name}`;
    return {
      title: `${plural} — ${site.name}`,
      description,
      alternates: { canonical: url },
      openGraph: {
        title: `${plural} — ${site.name}`,
        description,
        url,
        siteName: site.name,
        locale: site.locale,
        type: "website",
      },
    };
  }

  return { title: "Not Found" };
}

export default async function PublicSlugPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  const { slug } = await params;
  const { page } = await searchParams;
  const site = await getCurrentSite();

  // Prevent root catch-all from serving reserved paths.
  if (slug === "admin" || slug === "api" || slug === "category" || slug === "search") {
    notFound();
  }

  if (site.slug === "calm-routine") {
    const calmPost = getCalmPost(slug);
    if (calmPost) {
      return (
        <CalmShell site={site}>
          <CalmPostView post={calmPost} />
        </CalmShell>
      );
    }
    notFound();
  }

  const guide = getDialGuide(slug);
  if (guide && site.homepageTemplate === "dial") {
    const dialConfig = await getDialHomepageConfig(site.id);
    return <GuideArticle guide={guide} siteName={site.name} watches={dialConfig.watches} />;
  }

  const ct = site.contentTypes.find((c) => c.value === slug);
  if (ct) {
    return <ContentTypeListing site={site} contentType={slug} page={page} />;
  }

  notFound();
}

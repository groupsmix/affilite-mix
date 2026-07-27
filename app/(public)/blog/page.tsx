import Link from "next/link";
import { requireSiteFeature } from "@/lib/site-features";
import { listPublishedContent } from "@/lib/dal/content";
import { ContentCardGrid } from "../components/content-card-grid";
import { JsonLd, breadcrumbJsonLd } from "../components/json-ld";
import { notFound } from "next/navigation";
import type { Metadata } from "next";

export const revalidate = 60;

const PAGE_SIZE = 12;

export async function generateMetadata(): Promise<Metadata> {
  const site = await requireSiteFeature("blog");
  const title = `Blog — ${site.name}`;
  const description = `Editorial articles, how-tos, and buying advice from ${site.name}.`;

  return {
    title,
    description,
    alternates: { canonical: `https://${site.domain}/blog` },
    openGraph: {
      title,
      description,
      url: `https://${site.domain}/blog`,
      siteName: site.name,
      locale: site.locale,
      type: "website",
    },
  };
}

export default async function BlogIndexPage() {
  const site = await requireSiteFeature("blog");
  const items = await listPublishedContent(site.id, "blog", PAGE_SIZE, 0);

  if (!items) {
    notFound();
  }

  const breadcrumbs = breadcrumbJsonLd(site, [
    { name: site.name, path: "/" },
    { name: "Blog", path: "/blog" },
  ]);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <JsonLd data={breadcrumbs} />
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
        <nav aria-label="Breadcrumb" className="mb-8 text-sm text-muted-foreground">
          <ol className="flex items-center gap-2">
            <li>
              <Link href="/" className="transition-colors hover:text-foreground">
                {site.name}
              </Link>
            </li>
            <li aria-hidden="true">/</li>
            <li className="text-foreground">Blog</li>
          </ol>
        </nav>

        <header className="mb-10">
          <h1 className="max-w-3xl font-serif text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
            Blog
          </h1>
          <p className="mt-3 max-w-2xl text-muted-foreground">
            Editorial guides, buyer tips, and behind-the-scenes methodology from the {site.name}{" "}
            team.
          </p>
        </header>

        {items.length > 0 ? (
          <ContentCardGrid items={items} locale={site.locale} className="lg:grid-cols-3" />
        ) : (
          <div className="rounded-2xl border border-border bg-card/50 py-16 text-center text-muted-foreground">
            <p className="text-lg">No blog posts yet.</p>
          </div>
        )}
      </main>
    </div>
  );
}

import { getCurrentSite } from "@/lib/site-context";
import { getAuthorBySlug, listPublishedContentByAuthor } from "@/lib/dal/authors";
import { JsonLd, breadcrumbJsonLd, personJsonLd } from "../../components/json-ld";
import { Breadcrumbs } from "../../components/breadcrumbs";
import { ContentCard } from "../../components/content-card";
import Image from "next/image";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { unstable_noStore } from "next/cache";

interface AuthorPageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: AuthorPageProps): Promise<Metadata> {
  const { slug } = await params;
  const site = await getCurrentSite();
  const author = await getAuthorBySlug(site.id, slug);

  if (!author) {
    return { title: "Author not found" };
  }

  const title = `${author.name} - ${site.name}`;
  const description =
    author.bio ||
    `${author.name} writes ${site.name} ${site.brand.niche} reviews, comparisons and guides.`;

  return {
    title,
    description: description.slice(0, 155),
    alternates: {
      canonical: `https://${site.domain}/author/${author.slug}`,
    },
    openGraph: {
      title,
      description,
      url: `https://${site.domain}/author/${author.slug}`,
      siteName: site.name,
      locale: site.language,
      images: author.photo_url ? [author.photo_url] : undefined,
    },
  };
}

export default async function AuthorPage({ params }: AuthorPageProps) {
  unstable_noStore();
  const { slug } = await params;
  const site = await getCurrentSite();
  const author = await getAuthorBySlug(site.id, slug);

  if (!author) {
    notFound();
  }

  const content = await listPublishedContentByAuthor(site.id, author.id, 50);
  const locale = site.language === "ar" ? "ar-SA" : "en-US";

  const breadcrumbs = breadcrumbJsonLd(site, [
    { name: site.name, path: "/" },
    { name: author.name, path: `/author/${author.slug}` },
  ]);

  return (
    <main id="main-content" className="mx-auto max-w-4xl px-4 py-8">
      <JsonLd data={breadcrumbs} />
      <JsonLd data={personJsonLd(site, author)} />

      <Breadcrumbs items={[{ label: site.name, href: "/" }, { label: author.name }]} />

      <section className="mb-10">
        <div className="flex flex-col items-start gap-6 sm:flex-row sm:items-center">
          {author.photo_url && (
            <Image
              src={author.photo_url}
              alt={author.name}
              width={120}
              height={120}
              className="rounded-full object-cover"
              priority
            />
          )}
          <div>
            <h1 className="text-3xl font-bold tracking-tight">{author.name}</h1>
            {author.credentials && (
              <p className="mt-1 text-lg text-gray-600">{author.credentials}</p>
            )}
            {author.expertise.length > 0 && (
              <p className="mt-2 text-sm text-gray-500">Expertise: {author.expertise.join(", ")}</p>
            )}
          </div>
        </div>

        {author.bio && (
          <div className="prose prose-lg mt-6 max-w-none text-gray-700">
            <p>{author.bio}</p>
          </div>
        )}

        {Object.keys(author.social_links).length > 0 && (
          <div className="mt-4 flex flex-wrap gap-3">
            {Object.entries(author.social_links).map(([platform, url]) =>
              url ? (
                <a
                  key={platform}
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm font-medium text-gray-600 hover:text-gray-900 hover:underline"
                >
                  {platform}
                </a>
              ) : null,
            )}
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-4 text-2xl font-bold">
          {site.language === "ar" ? "المقالات المنشورة" : "Published articles"}
        </h2>
        {content.length === 0 ? (
          <p className="text-gray-600">
            {site.language === "ar"
              ? "لا توجد مقالات منشورة لهذا المؤلف."
              : "No published articles from this author yet."}
          </p>
        ) : (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {content.map((c) => (
              <ContentCard key={c.id} content={c} locale={locale} />
            ))}
          </div>
        )}
      </section>
    </main>
  );
}

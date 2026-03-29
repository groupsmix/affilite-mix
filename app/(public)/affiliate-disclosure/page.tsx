import type { Metadata } from "next";
import { getCurrentSite } from "@/lib/site-context";
import { Breadcrumbs } from "../components/breadcrumbs";
import { JsonLd, breadcrumbJsonLd } from "../components/json-ld";
import { redirect } from "next/navigation";
import Link from "next/link";

export const revalidate = 3600;

export async function generateMetadata(): Promise<Metadata> {
  const site = await getCurrentSite();
  const disclosurePage = site.pages.affiliateDisclosurePage;

  if (!disclosurePage) {
    return { title: "Not Found" };
  }

  const url = `https://${site.domain}/affiliate-disclosure`;

  return {
    title: `${disclosurePage.title} — ${site.name}`,
    description: disclosurePage.description,
    alternates: { canonical: url },
    openGraph: {
      title: `${disclosurePage.title} — ${site.name}`,
      description: disclosurePage.description,
      url,
      siteName: site.name,
      locale: site.locale,
      type: "website",
    },
  };
}

export default async function AffiliateDisclosurePage() {
  const site = await getCurrentSite();
  const disclosurePage = site.pages.affiliateDisclosurePage;

  if (!disclosurePage) {
    redirect("/");
  }

  const breadcrumbs = breadcrumbJsonLd(site, [
    { name: site.name, path: "/" },
    { name: disclosurePage.title, path: "/affiliate-disclosure" },
  ]);

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <JsonLd data={breadcrumbs} />

      <Breadcrumbs
        items={[
          { label: site.name, href: "/" },
          { label: disclosurePage.title },
        ]}
      />

      <header className="mb-8">
        <h1 className="mb-2 text-3xl font-bold">{disclosurePage.title}</h1>
        <p className="text-gray-600">{disclosurePage.description}</p>
      </header>

      <div className="prose max-w-none">
        <h2>How We Earn Revenue</h2>
        <p>
          {site.name} is a participant in various affiliate programs, including
          the Amazon Associates Program. This means that when you click on
          certain links on our site and make a purchase, we may earn a small
          commission at no additional cost to you.
        </p>

        <h2>Our Editorial Policy</h2>
        <p>
          Our reviews and recommendations are based on our honest editorial
          assessments and are not influenced by affiliate partnerships. We only
          recommend products that we believe provide genuine value to our
          readers.
        </p>
        <p>
          The presence or absence of an affiliate link does not affect our
          editorial judgment. Products are reviewed and rated based on their
          merits, regardless of whether we earn a commission from them.
        </p>

        <h2>What This Means for You</h2>
        <ul>
          <li>
            <strong>No extra cost:</strong> You pay the same price whether you
            use our affiliate link or go directly to the retailer.
          </li>
          <li>
            <strong>Honest reviews:</strong> Affiliate relationships never
            influence our ratings or recommendations.
          </li>
          <li>
            <strong>Transparency:</strong> Pages containing affiliate links are
            clearly marked with a disclosure notice.
          </li>
          <li>
            <strong>Supporting our work:</strong> Using our links helps us
            continue creating free, in-depth content for you.
          </li>
        </ul>

        <h2>Disclosure Notice</h2>
        <p>
          Throughout the site, you will see the following disclosure on pages
          that contain affiliate links:
        </p>
        <blockquote>
          <p>{site.affiliateDisclosure}</p>
        </blockquote>

        <h2>Questions?</h2>
        <p>
          If you have any questions about our affiliate relationships or
          editorial policy, please{" "}
          {site.pages.contact ? (
            <Link
              href="/contact"
              className="font-medium transition-colors"
              style={{ color: "var(--color-accent, #10B981)" }}
            >
              contact us
            </Link>
          ) : (
            <>
              email us at{" "}
              <a
                href={`mailto:${site.brand.contactEmail}`}
                className="font-medium transition-colors"
                style={{ color: "var(--color-accent, #10B981)" }}
              >
                {site.brand.contactEmail}
              </a>
            </>
          )}
          .
        </p>
      </div>
    </div>
  );
}

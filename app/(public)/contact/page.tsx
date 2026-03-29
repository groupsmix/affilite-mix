import type { Metadata } from "next";
import { getCurrentSite } from "@/lib/site-context";
import { Breadcrumbs } from "../components/breadcrumbs";
import { JsonLd, breadcrumbJsonLd } from "../components/json-ld";
import { redirect } from "next/navigation";

export const revalidate = 3600;

export async function generateMetadata(): Promise<Metadata> {
  const site = await getCurrentSite();
  const contactPage = site.pages.contact;

  if (!contactPage) {
    return { title: "Not Found" };
  }

  const url = `https://${site.domain}/contact`;

  return {
    title: `${contactPage.title} — ${site.name}`,
    description: contactPage.description,
    alternates: { canonical: url },
    openGraph: {
      title: `${contactPage.title} — ${site.name}`,
      description: contactPage.description,
      url,
      siteName: site.name,
      locale: site.locale,
      type: "website",
    },
  };
}

export default async function ContactPage() {
  const site = await getCurrentSite();
  const contactPage = site.pages.contact;

  if (!contactPage) {
    redirect("/");
  }

  const breadcrumbs = breadcrumbJsonLd(site, [
    { name: site.name, path: "/" },
    { name: contactPage.title, path: "/contact" },
  ]);

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <JsonLd data={breadcrumbs} />

      <Breadcrumbs
        items={[
          { label: site.name, href: "/" },
          { label: contactPage.title },
        ]}
      />

      <header className="mb-8">
        <h1 className="mb-2 text-3xl font-bold">{contactPage.title}</h1>
        <p className="text-gray-600">{contactPage.description}</p>
      </header>

      <div className="prose max-w-none">
        <p>
          Have a question, suggestion, or want to work with us? We&apos;d love to
          hear from you.
        </p>

        <h2>Get in Touch</h2>
        <p>
          The best way to reach us is by email at{" "}
          <a
            href={`mailto:${contactPage.email}`}
            className="font-medium transition-colors"
            style={{ color: "var(--color-accent, #10B981)" }}
          >
            {contactPage.email}
          </a>
          .
        </p>

        <h2>What We Can Help With</h2>
        <ul>
          <li>Questions about our reviews or recommendations</li>
          <li>Suggestions for products or topics to cover</li>
          <li>Partnership and collaboration inquiries</li>
          <li>Corrections or feedback on our content</li>
          <li>General questions about {site.name}</li>
        </ul>

        <h2>Response Time</h2>
        <p>
          We aim to respond to all emails within 1-2 business days. For urgent
          matters, please include &quot;URGENT&quot; in the subject line.
        </p>
      </div>
    </div>
  );
}

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

  const isAr = site.language === "ar";
  const title = isAr ? "اتصل بنا" : contactPage.title;
  const description = isAr
    ? "تواصل معنا لأي استفسارات أو اقتراحات أو فرص تعاون."
    : contactPage.description;
  const url = `https://${site.domain}/contact`;

  return {
    title: `${title} — ${site.name}`,
    description,
    alternates: { canonical: url },
    openGraph: {
      title: `${title} — ${site.name}`,
      description,
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

  const isAr = site.language === "ar";

  const breadcrumbs = breadcrumbJsonLd(site, [
    { name: site.name, path: "/" },
    { name: isAr ? "اتصل بنا" : contactPage.title, path: "/contact" },
  ]);

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <JsonLd data={breadcrumbs} />

      <Breadcrumbs
        items={[
          { label: site.name, href: "/" },
          { label: isAr ? "اتصل بنا" : contactPage.title },
        ]}
      />

      <header className="mb-8">
        <h1 className="mb-2 text-3xl font-bold">
          {isAr ? "اتصل بنا" : contactPage.title}
        </h1>
        <p className="text-gray-600">
          {isAr
            ? "تواصل معنا لأي استفسارات أو اقتراحات أو فرص تعاون."
            : contactPage.description}
        </p>
      </header>

      <div className="prose max-w-none">
        <p>
          {isAr
            ? "هل لديك سؤال أو اقتراح أو ترغب في العمل معنا؟ يسعدنا سماع رأيك."
            : "Have a question, suggestion, or want to work with us? We\u2019d love to hear from you."}
        </p>

        <h2>{isAr ? "تواصل معنا" : "Get in Touch"}</h2>
        <p>
          {isAr ? (
            <>
              أفضل طريقة للتواصل معنا هي عبر البريد الإلكتروني على{" "}
              <a
                href={`mailto:${contactPage.email}`}
                className="font-medium transition-colors"
                style={{ color: "var(--color-accent, #10B981)" }}
              >
                {contactPage.email}
              </a>
              .
            </>
          ) : (
            <>
              The best way to reach us is by email at{" "}
              <a
                href={`mailto:${contactPage.email}`}
                className="font-medium transition-colors"
                style={{ color: "var(--color-accent, #10B981)" }}
              >
                {contactPage.email}
              </a>
              .
            </>
          )}
        </p>

        <h2>{isAr ? "كيف يمكننا مساعدتك" : "What We Can Help With"}</h2>
        <ul>
          <li>
            {isAr
              ? "أسئلة حول مراجعاتنا أو توصياتنا"
              : "Questions about our reviews or recommendations"}
          </li>
          <li>
            {isAr
              ? "اقتراحات لمنتجات أو مواضيع لتغطيتها"
              : "Suggestions for products or topics to cover"}
          </li>
          <li>
            {isAr
              ? "استفسارات الشراكة والتعاون"
              : "Partnership and collaboration inquiries"}
          </li>
          <li>
            {isAr
              ? "تصحيحات أو ملاحظات على محتوانا"
              : "Corrections or feedback on our content"}
          </li>
          <li>
            {isAr
              ? `أسئلة عامة حول ${site.name}`
              : `General questions about ${site.name}`}
          </li>
        </ul>

        <h2>{isAr ? "وقت الاستجابة" : "Response Time"}</h2>
        <p>
          {isAr
            ? "نسعى للرد على جميع الرسائل خلال يوم إلى يومي عمل. للأمور العاجلة، يرجى كتابة \"عاجل\" في عنوان الرسالة."
            : "We aim to respond to all emails within 1-2 business days. For urgent matters, please include \"URGENT\" in the subject line."}
        </p>
      </div>
    </div>
  );
}

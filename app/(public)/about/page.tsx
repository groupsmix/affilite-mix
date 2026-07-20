import { getCurrentSite } from "@/lib/site-context";
import { staticPageMetadata } from "@/lib/seo";
import type { Metadata } from "next";
import { isCryptoTaxAu, CryptoTaxAUAbout } from "../components/site-static-content";
import { JsonLd, breadcrumbJsonLd } from "../components/json-ld";

export async function generateMetadata(): Promise<Metadata> {
  const site = await getCurrentSite();
  const isAr = site.language === "ar";

  return staticPageMetadata({
    site,
    title: isAr ? "من نحن" : "About Us",
    description: isAr
      ? `تعرف على ${site.name} ومهمتنا في مساعدتك على اكتشاف أفضل المنتجات والعروض.`
      : `Learn more about ${site.name} and our mission to help you discover the best products and deals.`,
    path: "/about",
  });
}

export default async function AboutPage() {
  const site = await getCurrentSite();
  const isArabic = site.language === "ar";
  const isCrypto = isCryptoTaxAu(site);
  const breadcrumbs = breadcrumbJsonLd(site, [
    { name: site.name, path: "/" },
    { name: isArabic ? "من نحن" : "About Us", path: "/about" },
  ]);

  if (isCrypto) {
    return (
      <div className="container mx-auto max-w-4xl px-4 py-12">
        <JsonLd data={breadcrumbs} />
        <h1 className="mb-8 text-3xl font-bold" style={{ color: "var(--ink)" }}>
          {site.pages.about.title}
        </h1>
        <div
          className={`prose prose-lg max-w-none ${isArabic ? "rtl" : ""}`}
          style={{ color: "var(--ink-70)" }}
        >
          <CryptoTaxAUAbout site={site} />
        </div>
      </div>
    );
  }

  // Derive "What We Offer" from the site's real feature set so the page
  // never claims capabilities the site doesn't have. The previous
  // hardcoded list advertised "finance and loan calculators", a "daily
  // deals platform", and "localized content" on every tenant regardless
  // of whether those features existed (e.g. WristNerd, a watch review
  // site, offered none of them).
  const plural = site.productLabelPlural.toLowerCase();
  const f = site.features;
  const offerings: string[] = [
    isArabic ? `مراجعات ${plural} شاملة ونزيهة` : `Comprehensive, unbiased ${plural} reviews`,
  ];
  if (f.comparisons) {
    offerings.push(
      isArabic
        ? "مقارنات جانبية لتسهيل عملية اتخاذ القرار"
        : "Side-by-side comparisons to simplify decision-making",
    );
  }
  if (f.giftFinder) {
    offerings.push(
      isArabic
        ? "أداة تساعدك على اختيار الهدية المناسبة للمناسبة والشخص"
        : `A gift finder that matches ${plural} to the recipient and occasion`,
    );
  }
  if (f.blog) {
    offerings.push(
      isArabic
        ? "أدلة شراء ومحتوى تحريري من الخبراء"
        : "Expert buying guides and editorial content",
    );
  }
  if (f.deals) {
    offerings.push(
      isArabic ? "عروض وأسعار مختارة بعناية" : "Hand-picked deals and current top picks",
    );
  }
  if (f.newsletter) {
    offerings.push(
      isArabic
        ? "نشرة إخبارية بأحدث المراجعات والعروض إلى بريدك"
        : "A newsletter with new reviews and deals delivered to your inbox",
    );
  }

  return (
    <div className="container mx-auto max-w-4xl px-4 py-12">
      <JsonLd data={breadcrumbs} />
      <h1 className="mb-8 text-3xl font-bold" style={{ color: "var(--ink)" }}>
        {isArabic ? "من نحن" : "About Us"}
      </h1>

      <div
        className={`prose prose-lg max-w-none ${isArabic ? "rtl" : ""}`}
        style={{ color: "var(--ink-70)" }}
      >
        <p className="mb-6 text-lg leading-relaxed">
          {isArabic
            ? `${site.name} هي منصتك المفضلة لاكتشاف أفضل المنتجات والعروض. نحن ملتزمون بتقديم محتوى موثوق ومراجعات شاملة لمساعدتك في اتخاذ قرارات شراء مستنيرة.`
            : `${site.name} is your trusted destination for discovering the best products and deals. We are committed to providing reliable content and comprehensive reviews to help you make informed purchasing decisions.`}
        </p>

        <h2 className="mb-4 mt-8 text-2xl font-semibold" style={{ color: "var(--ink)" }}>
          {isArabic ? "مهمتنا" : "Our Mission"}
        </h2>
        <p className="mb-6 leading-relaxed">
          {isArabic
            ? "مهمتنا هي تبسيط عملية التسوق عبر الإنترنت من خلال تقديم توصيات منتجات مُختارة بعناية، ومقارنات تفصيلية، وآراء خبراء في مختلف الفئات. نؤمن بأن كل مستحق يستحق منتجات عالية الجودة تناسب احتياجاته وميزانيته."
            : "Our mission is to simplify your online shopping experience by providing carefully curated product recommendations, detailed comparisons, and expert insights across various categories. We believe everyone deserves quality products that match their needs and budget."}
        </p>

        <h2 className="mb-4 mt-8 text-2xl font-semibold" style={{ color: "var(--ink)" }}>
          {isArabic ? "ما نقدمه" : "What We Offer"}
        </h2>
        <ul className="mb-6 list-disc space-y-2 pl-6">
          {offerings.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>

        <h2 className="mb-4 mt-8 text-2xl font-semibold" style={{ color: "var(--ink)" }}>
          {isArabic ? "تواصل معنا" : "Contact Us"}
        </h2>
        <p className="mb-6 leading-relaxed">
          {isArabic
            ? "نحن نحب أن نسمع منك! إذا كانت لديك أي أسئلة أو اقتراحات أو ترغب في التعاون معنا، لا تتردد في التواصل."
            : "We love hearing from you! If you have any questions, suggestions, or would like to collaborate with us, please don't hesitate to reach out."}
        </p>

        <div
          className="mt-8 rounded-lg p-6"
          style={{ backgroundColor: "var(--bone)", border: "1px solid var(--rule)" }}
        >
          <p className="text-sm" style={{ color: "var(--ink-60)" }}>
            <strong>{isArabic ? "البريد الإلكتروني:" : "Email:"}</strong>{" "}
            <a
              href={`mailto:contact@${site.domain}`}
              className="hover:underline"
              style={{ color: "var(--oltigo-green)" }}
            >
              contact@{site.domain}
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}

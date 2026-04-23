import { getCurrentSite } from "@/lib/site-context";
import type { Metadata } from "next";

export async function generateMetadata(): Promise<Metadata> {
  const site = await getCurrentSite();
  const isAr = site.language === "ar";
  const title = site.pages.about.title;
  const url = `https://${site.domain}/about`;

  return {
    title,
    description: site.pages.about.description,
    alternates: { canonical: url },
  };
}

export default async function AboutPage() {
  const site = await getCurrentSite();
  const isAr = site.language === "ar";

  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      <h1 className="mb-6 text-3xl font-bold">{site.pages.about.title}</h1>
      <div className="prose prose-gray max-w-none">
        <p className="text-lg text-gray-700">{site.pages.about.description}</p>

        <h2>{isAr ? "مهمتنا" : "Our Mission"}</h2>
        <p>
          {isAr
            ? `في ${site.name}، نسعى لتقديم محتوى عالي الجودة يساعدك على اتخاذ قرارات مستنيرة حول ${site.brand.niche}.`
            : `At ${site.name}, we strive to deliver high-quality content that helps you make informed decisions about ${site.brand.niche}.`}
        </p>

        <h2>{isAr ? "ما الذي نفعله" : "What We Do"}</h2>
        <p>
          {isAr
            ? `نقوم بمراجعة شاملة ومقارنات تفصيلية ومقالات إرشادية تغطي أحدث المنتجات والخدمات في مجال ${site.brand.niche}. فريقنا من الخبراء يختبر كل منتج بدقة لضمان دقة المعلومات التي نقدمها.`
            : `We conduct comprehensive reviews, detailed comparisons, and insightful guides covering the latest products and services in ${site.brand.niche}. Our team of experts rigorously tests each product to ensure the information we provide is accurate and helpful.`}
        </p>

        <h2>{isAr ? "استقلالية التحرير" : "Editorial Independence"}</h2>
        <p>
          {isAr
            ? `نحافظ على استقلالية التحرير الكاملة. آراؤنا هي آراؤنا الخاصة، ولا تتأثر بالعلاقات التجارية. ${site.affiliateDisclosure}`
            : `We maintain complete editorial independence. Our opinions are our own and are not influenced by commercial relationships. ${site.affiliateDisclosure}`}
        </p>

        <h2>{isAr ? "تواصل معنا" : "Contact Us"}</h2>
        <p>
          {isAr
            ? "إذا كان لديك أي أسئلة أو تعليقات، نتطلع إلى سماعك منك:"
            : "If you have any questions or feedback, we'd love to hear from you:"}
        </p>
        <p>
          <a href={`mailto:${site.brand.contactEmail}`} className="text-blue-600 hover:underline">
            {site.brand.contactEmail}
          </a>
        </p>
      </div>
    </div>
  );
}

import { getCurrentSite } from "@/lib/site-context";
import type { Metadata } from "next";

export async function generateMetadata(): Promise<Metadata> {
  const site = await getCurrentSite();
  
  return {
    title: `About Us | ${site.name}`,
    description: `Learn more about ${site.name} and our mission to help you discover the best products and deals.`,
    alternates: {
      canonical: `https://${site.domain}/about`,
    },
  };
}

export default async function AboutPage() {
  const site = await getCurrentSite();
  const isArabic = site.language === "ar";

  return (
    <div className="container mx-auto max-w-4xl px-4 py-12">
      <h1 className="mb-8 text-3xl font-bold text-gray-900">
        {isArabic ? "من نحن" : "About Us"}
      </h1>
      
      <div className={`prose prose-lg max-w-none text-gray-700 ${isArabic ? "rtl" : ""}`}>
        <p className="mb-6 text-lg leading-relaxed">
          {isArabic 
            ? `${site.name} هي منصتك المفضلة لاكتشاف أفضل المنتجات والعروض. نحن ملتزمون بتقديم محتوى موثوق ومراجعات شاملة لمساعدتك في اتخاذ قرارات شراء مستنيرة.`
            : `${site.name} is your trusted destination for discovering the best products and deals. We are committed to providing reliable content and comprehensive reviews to help you make informed purchasing decisions.`
          }
        </p>
        
        <h2 className="mb-4 mt-8 text-2xl font-semibold text-gray-900">
          {isArabic ? "مهمتنا" : "Our Mission"}
        </h2>
        <p className="mb-6 leading-relaxed">
          {isArabic
            ? "مهمتنا هي تبسيط عملية التسوق عبر الإنترنت من خلال تقديم توصيات منتجات مُختارة بعناية، ومقارنات تفصيلية، وآراء خبراء في مختلف الفئات. نؤمن بأن كل مستحق يستحق منتجات عالية الجودة تناسب احتياجاته وميزانيته."
            : "Our mission is to simplify your online shopping experience by providing carefully curated product recommendations, detailed comparisons, and expert insights across various categories. We believe everyone deserves quality products that match their needs and budget."
          }
        </p>
        
        <h2 className="mb-4 mt-8 text-2xl font-semibold text-gray-900">
          {isArabic ? "ما نقدمه" : "What We Offer"}
        </h2>
        <ul className="mb-6 list-disc space-y-2 pl-6">
          {isArabic ? (
            <>
              <li>مراجعات شاملة ونزيهة للمنتجات</li>
              <li>مقارنات جانبية لتسهيل عملية اتخاذ القرار</li>
              <li>آلة حاسبة للقروض والتمويل</li>
              <li>منصة عروض يومية مختارة بعناية</li>
              <li>محتوى مخصص بلغتك المفضلة</li>
            </>
          ) : (
            <>
              <li>Comprehensive and unbiased product reviews</li>
              <li>Side-by-side comparisons to simplify decision-making</li>
              <li>Finance and loan calculators</li>
              <li>Curated daily deals platform</li>
              <li>Localized content in your preferred language</li>
            </>
          )}
        </ul>
        
        <h2 className="mb-4 mt-8 text-2xl font-semibold text-gray-900">
          {isArabic ? "تواصل معنا" : "Contact Us"}
        </h2>
        <p className="mb-6 leading-relaxed">
          {isArabic
            ? "نحن نحب أن نسمع منك! إذا كانت لديك أي أسئلة أو اقتراحات أو ترغب في التعاون معنا، لا تتردد في التواصل."
            : "We love hearing from you! If you have any questions, suggestions, or would like to collaborate with us, please don't hesitate to reach out."
          }
        </p>
        
        <div className="mt-8 rounded-lg bg-gray-50 p-6">
          <p className="text-sm text-gray-600">
            <strong>{isArabic ? "البريد الإلكتروني:" : "Email:"}</strong>{" "}
            <a href={`mailto:contact@${site.domain}`} className="text-blue-600 hover:underline">
              contact@{site.domain}
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}

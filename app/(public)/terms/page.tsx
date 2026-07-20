import { getCurrentSite } from "@/lib/site-context";
import { staticPageMetadata } from "@/lib/seo";
import type { Metadata } from "next";
import { isCryptoTaxAu, CryptoTaxAUTerms } from "../components/site-static-content";
import { JsonLd, breadcrumbJsonLd } from "../components/json-ld";

export async function generateMetadata(): Promise<Metadata> {
  const site = await getCurrentSite();
  const isAr = site.language === "ar";

  return staticPageMetadata({
    site,
    title: isAr ? "الشروط والأحكام" : "Terms of Service",
    description: isAr
      ? `الشروط والأحكام الخاصة باستخدام موقع ${site.name}.`
      : `Terms and conditions for using ${site.name}.`,
    path: "/terms",
  });
}

export default async function TermsPage() {
  const site = await getCurrentSite();
  const isAr = site.language === "ar";
  const breadcrumbs = breadcrumbJsonLd(site, [
    { name: site.name, path: "/" },
    { name: isAr ? "الشروط والأحكام" : "Terms of Service", path: "/terms" },
  ]);

  if (isCryptoTaxAu(site)) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-12">
        <JsonLd data={breadcrumbs} />
        <h1 className="mb-6 text-3xl font-bold">{site.pages.terms.title}</h1>
        <div className="prose prose-gray max-w-none">
          <CryptoTaxAUTerms site={site} />
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      <JsonLd data={breadcrumbs} />
      <h1 className="mb-6 text-3xl font-bold">{isAr ? "الشروط والأحكام" : "Terms of Service"}</h1>
      <div className="prose prose-gray max-w-none">
        <p>
          {isAr
            ? `مرحبًا بك في ${site.name}. باستخدام هذا الموقع، فإنك توافق على الشروط التالية.`
            : `Welcome to ${site.name}. By using this website, you agree to the following terms.`}
        </p>

        <h2>{isAr ? "استخدام المحتوى" : "Use of Content"}</h2>
        <p>
          {isAr
            ? "جميع المحتويات المنشورة على هذا الموقع هي لأغراض إعلامية فقط. لا ينبغي اعتبارها نصيحة مهنية."
            : "All content published on this website is for informational purposes only. It should not be considered professional advice."}
        </p>

        <h2>{isAr ? "روابط الشركاء التابعين" : "Affiliate Links"}</h2>
        <p>
          {isAr
            ? `يحتوي ${site.name} على روابط تابعة لمنتجات. عند الشراء من خلال هذه الروابط، قد نحصل على عمولة دون أي تكلفة إضافية عليك.`
            : `${site.name} contains affiliate links to products. When you purchase through these links, we may earn a commission at no additional cost to you.`}
        </p>

        <h2>{isAr ? "حدود المسؤولية" : "Limitation of Liability"}</h2>
        <p>
          {isAr
            ? `لا يتحمل ${site.name} المسؤولية عن أي أضرار ناتجة عن استخدام هذا الموقع أو المنتجات المذكورة فيه.`
            : `${site.name} is not liable for any damages resulting from the use of this website or the products mentioned herein.`}
        </p>

        <h2>{isAr ? "العمر المطلوب" : "Age Requirement"}</h2>
        <p>
          {isAr
            ? "خدماتنا غير موجهة للأطفال دون سن 16 عامًا (في الاتحاد الأوروبي/المملكة المتحدة) أو 13 عامًا (في الولايات المتحدة). باستخدامك لهذا الموقع، فإنك تؤكد أنك تبلغ من العمر 16 عامًا أو أكثر (أو 13 عامًا أو أكثر في الولايات المتحدة) أو أنك تستخدم الموقع تحت إشراف ولي أمر."
            : "Our services are not directed to children under 16 (EU/UK) or under 13 (US). By using this site, you confirm that you are at least 16 years old (or 13 in the US), or that you are using this site under parental supervision. We do not knowingly collect personal information from children. See our Privacy Policy for details."}
        </p>

        <h2>{isAr ? "التغييرات" : "Changes"}</h2>
        <p>
          {isAr
            ? "نحتفظ بالحق في تعديل هذه الشروط في أي وقت. سيتم نشر التحديثات على هذه الصفحة."
            : "We reserve the right to modify these terms at any time. Updates will be posted on this page."}
        </p>
      </div>
    </div>
  );
}

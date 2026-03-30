import { getCurrentSite } from "@/lib/site-context";
import type { Metadata } from "next";

export async function generateMetadata(): Promise<Metadata> {
  const site = await getCurrentSite();
  return {
    title: `${site.language === "ar" ? "شروط الاستخدام" : "Terms of Use"} — ${site.name}`,
  };
}

export default async function TermsPage() {
  const site = await getCurrentSite();
  const isAr = site.language === "ar";

  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      <h1 className="mb-6 text-3xl font-bold">
        {isAr ? "شروط الاستخدام" : "Terms of Use"}
      </h1>
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

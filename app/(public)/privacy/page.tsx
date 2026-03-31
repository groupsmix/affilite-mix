import { getCurrentSite } from "@/lib/site-context";
import type { Metadata } from "next";

export async function generateMetadata(): Promise<Metadata> {
  const site = await getCurrentSite();
  const isAr = site.language === "ar";
  const title = isAr ? "سياسة الخصوصية" : "Privacy Policy";
  const url = `https://${site.domain}/privacy`;

  return {
    title: `${title} — ${site.name}`,
    description: isAr
      ? `سياسة الخصوصية لموقع ${site.name} — كيف نجمع بياناتك ونستخدمها ونحميها.`
      : `Privacy policy for ${site.name} — how we collect, use, and protect your information.`,
    alternates: { canonical: url },
  };
}

export default async function PrivacyPage() {
  const site = await getCurrentSite();
  const isAr = site.language === "ar";

  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      <h1 className="mb-6 text-3xl font-bold">{isAr ? "سياسة الخصوصية" : "Privacy Policy"}</h1>
      <div className="prose prose-gray max-w-none">
        <p>
          {isAr
            ? `نحن في ${site.name} نأخذ خصوصيتك على محمل الجد. توضح سياسة الخصوصية هذه كيفية جمع معلوماتك واستخدامها وحمايتها.`
            : `At ${site.name}, we take your privacy seriously. This privacy policy explains how we collect, use, and protect your information.`}
        </p>

        <h2>{isAr ? "المعلومات التي نجمعها" : "Information We Collect"}</h2>
        <ul>
          <li>
            {isAr
              ? "معلومات التصفح: نستخدم ملفات تعريف الارتباط لتحسين تجربتك على الموقع."
              : "Browsing information: We use cookies to improve your experience on our site."}
          </li>
          <li>
            {isAr
              ? "بيانات النقرات: نتتبع النقرات على روابط الشركاء التابعين فقط عند موافقتك على ملفات تعريف الارتباط."
              : "Click data: We track clicks on affiliate links only when you have accepted cookies."}
          </li>
          <li>
            {isAr
              ? "البريد الإلكتروني: إذا اشتركت في النشرة البريدية، نحتفظ ببريدك الإلكتروني."
              : "Email: If you subscribe to our newsletter, we store your email address."}
          </li>
        </ul>

        <h2>{isAr ? "ملفات تعريف الارتباط" : "Cookies"}</h2>
        <p>
          {isAr
            ? "نستخدم ملفات تعريف الارتباط لتتبع التحليلات والنقرات التابعة. يمكنك قبول أو رفض ملفات تعريف الارتباط عبر شريط الموافقة المعروض عند زيارتك الأولى."
            : "We use cookies for analytics and affiliate click tracking. You can accept or reject cookies via the consent banner shown on your first visit."}
        </p>

        <h2>{isAr ? "روابط الشركاء التابعين" : "Affiliate Links"}</h2>
        <p>
          {isAr
            ? `يحتوي ${site.name} على روابط تابعة. عند النقر عليها، قد نحصل على عمولة من التاجر.`
            : `${site.name} contains affiliate links. When you click on them, we may earn a commission from the merchant.`}
        </p>

        <h2>{isAr ? "حقوقك" : "Your Rights"}</h2>
        <p>
          {isAr
            ? "يحق لك طلب الوصول إلى بياناتك أو حذفها. تواصل معنا عبر صفحة الاتصال."
            : "You have the right to request access to or deletion of your data. Contact us through the contact page."}
        </p>

        <h2>{isAr ? "اتصل بنا" : "Contact Us"}</h2>
        <p>
          {isAr
            ? "إذا كانت لديك أي أسئلة حول سياسة الخصوصية هذه، يرجى زيارة صفحة الاتصال."
            : "If you have any questions about this privacy policy, please visit our contact page."}
        </p>
      </div>
    </div>
  );
}

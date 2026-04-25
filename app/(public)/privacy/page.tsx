import { getCurrentSite } from "@/lib/site-context";
import type { Metadata } from "next";

export async function generateMetadata(): Promise<Metadata> {
  const site = await getCurrentSite();
  const isAr = site.language === "ar";
  const title = isAr ? "سياسة الخصوصية" : "Privacy Policy";
  const url = `https://${site.domain}/privacy`;

  return {
    title,
    description: isAr
      ? `سياسة الخصوصية لموقع ${site.name} — كيف نجمع بياناتك ونستخدمها ونحميها.`
      : `Privacy policy for ${site.name} — how we collect, use, and protect your information.`,
    alternates: { canonical: url },
  };
}

export default async function PrivacyPage() {
  const site = await getCurrentSite();
  const isAr = site.language === "ar";
  const contactEmail = site.pages.contact?.email ?? site.brand.contactEmail;

  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      <h1 className="mb-6 text-3xl font-bold">{isAr ? "سياسة الخصوصية" : "Privacy Policy"}</h1>
      <div className="prose prose-gray max-w-none">
        <p>
          {isAr
            ? `نحن في ${site.name} نأخذ خصوصيتك على محمل الجد. توضح سياسة الخصوصية هذه كيفية جمع معلوماتك واستخدامها وحمايتها.`
            : `At ${site.name}, we take your privacy seriously. This privacy policy explains how we collect, use, and protect your information.`}
        </p>

        <h2>{isAr ? "مسؤول البيانات" : "Data Controller"}</h2>
        <p>
          {isAr
            ? `مسؤول البيانات لهذا الموقع هو ${site.name}. يمكنك التواصل معنا عبر البريد الإلكتروني: `
            : `The data controller for this website is ${site.name}. You can contact us at: `}
          <a href={`mailto:${contactEmail}`}>{contactEmail}</a>
        </p>

        <h2>{isAr ? "الأساس القانوني للمعالجة" : "Legal Basis for Processing"}</h2>
        <p>
          {isAr
            ? "نقوم بمعالجة بياناتك الشخصية بناءً على الأسس القانونية التالية:"
            : "We process your personal data based on the following legal grounds:"}
        </p>
        <ul>
          <li>
            {isAr
              ? "الموافقة: ملفات تعريف الارتباط غير الأساسية (التحليلات وتتبع الشركاء) تُفعَّل فقط بعد موافقتك الصريحة."
              : "Consent: Non-essential cookies (analytics and affiliate tracking) are only activated after your explicit consent."}
          </li>
          <li>
            {isAr
              ? "المصلحة المشروعة: ملفات تعريف الارتباط الأساسية اللازمة لتشغيل الموقع (مثل حماية CSRF والمصادقة)."
              : "Legitimate interest: Essential cookies required for the site to function (e.g. CSRF protection, authentication)."}
          </li>
          <li>
            {isAr
              ? "تنفيذ العقد: معالجة بريدك الإلكتروني عند الاشتراك في النشرة البريدية."
              : "Performance of a contract: Processing your email address when you subscribe to our newsletter."}
          </li>
        </ul>

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
        <table>
          <thead>
            <tr>
              <th>{isAr ? "الاسم" : "Name"}</th>
              <th>{isAr ? "الغرض" : "Purpose"}</th>
              <th>{isAr ? "النوع" : "Type"}</th>
              <th>{isAr ? "مدة الاحتفاظ" : "Retention"}</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>nh-cookie-consent</td>
              <td>
                {isAr
                  ? "يخزن تفضيل موافقة ملفات تعريف الارتباط"
                  : "Stores your cookie consent preference"}
              </td>
              <td>{isAr ? "أساسي" : "Essential"}</td>
              <td>{isAr ? "سنة واحدة" : "1 year"}</td>
            </tr>
            <tr>
              <td>__csrf</td>
              <td>{isAr ? "رمز حماية CSRF" : "CSRF protection token"}</td>
              <td>{isAr ? "أساسي" : "Essential"}</td>
              <td>{isAr ? "4 ساعات" : "4 hours"}</td>
            </tr>
            <tr>
              <td>nh_admin_token</td>
              <td>{isAr ? "مصادقة جلسة المشرف" : "Admin session authentication"}</td>
              <td>{isAr ? "أساسي" : "Essential"}</td>
              <td>{isAr ? "الجلسة" : "Session"}</td>
            </tr>
            <tr>
              <td>{isAr ? "تتبع الشركاء" : "Affiliate tracking"}</td>
              <td>
                {isAr ? "يتتبع نقرات الشركاء للإسناد" : "Tracks affiliate clicks for attribution"}
              </td>
              <td>{isAr ? "غير أساسي" : "Non-essential"}</td>
              <td>{isAr ? "30 يومًا" : "30 days"}</td>
            </tr>
          </tbody>
        </table>

        <h2>{isAr ? "فترات الاحتفاظ بالبيانات" : "Data Retention Periods"}</h2>
        <p>
          {isAr
            ? "نحتفظ ببياناتك الشخصية فقط طالما كانت ضرورية للأغراض التي جمعت من أجلها:"
            : "We retain your personal data only as long as necessary for the purposes for which it was collected:"}
        </p>
        <ul>
          <li>{isAr ? "بيانات النقرات التابعة: 90 يومًا" : "Affiliate click data: 90 days"}</li>
          <li>
            {isAr
              ? "اشتراكات النشرة البريدية: حتى إلغاء الاشتراك"
              : "Newsletter subscriptions: Until you unsubscribe"}
          </li>
          <li>{isAr ? "مقاييس أداء الويب: 30 يومًا" : "Web performance metrics: 30 days"}</li>
        </ul>

        <h2>
          {isAr
            ? "معالجو البيانات من الأطراف الثالثة (المعالجون الفرعيون)"
            : "Third-Party Data Processors (Sub-processors)"}
        </h2>
        <p>
          {isAr
            ? "نشارك البيانات مع مزودي الخدمة الموثوقين لتشغيل هذا الموقع. يلتزم جميع المعالجين الفرعيين بمتطلبات حماية البيانات الصارمة:"
            : "We share data with trusted service providers to operate this website. All sub-processors are bound by strict data protection requirements:"}
        </p>
        <ul>
          <li>
            <strong>Cloudflare:</strong>{" "}
            {isAr
              ? "استضافة الويب، شبكة توصيل المحتوى، وتخزين المؤشرات (الولايات المتحدة/عالمي)"
              : "Web hosting, CDN, and edge computing (US/Global)"}
          </li>
          <li>
            <strong>Supabase:</strong>{" "}
            {isAr
              ? "استضافة قاعدة البيانات وتخزين البيانات (الولايات المتحدة/الاتحاد الأوروبي)"
              : "Database hosting and data storage (US/EU)"}
          </li>
          <li>
            <strong>Stripe:</strong>{" "}
            {isAr ? "معالجة المدفوعات (الولايات المتحدة)" : "Payment processing (US)"}
          </li>
          <li>
            <strong>Resend:</strong>{" "}
            {isAr
              ? "توصيل البريد الإلكتروني ورسائل النشرة البريدية (الولايات المتحدة)"
              : "Email delivery and newsletter communications (US)"}
          </li>
          <li>
            <strong>Sentry:</strong>{" "}
            {isAr
              ? "مراقبة الأخطاء وتتبع الأداء (الولايات المتحدة)"
              : "Error monitoring and performance tracking (US)"}
          </li>
        </ul>

        <h2>{isAr ? "روابط الشركاء التابعين" : "Affiliate Links"}</h2>
        <p>
          {isAr
            ? `يحتوي ${site.name} على روابط تابعة. عند النقر عليها، قد نحصل على عمولة من التاجر.`
            : `${site.name} contains affiliate links. When you click on them, we may earn a commission from the merchant.`}
        </p>

        <h2>{isAr ? "حقوقك" : "Your Rights"}</h2>
        <p>
          {isAr
            ? "بموجب لوائح حماية البيانات المعمول بها (بما في ذلك اللائحة العامة لحماية البيانات)، يحق لك:"
            : "Under applicable data protection regulations (including GDPR), you have the right to:"}
        </p>
        <ul>
          <li>{isAr ? "الوصول إلى بياناتك الشخصية" : "Access your personal data"}</li>
          <li>{isAr ? "تصحيح البيانات غير الدقيقة" : "Rectify inaccurate data"}</li>
          <li>{isAr ? "طلب حذف بياناتك" : "Request erasure of your data"}</li>
          <li>{isAr ? "الاعتراض على المعالجة" : "Object to processing"}</li>
          <li>{isAr ? "نقل البيانات" : "Data portability"}</li>
          <li>{isAr ? "سحب الموافقة في أي وقت" : "Withdraw consent at any time"}</li>
        </ul>
        <p>
          {isAr
            ? "لممارسة أي من هذه الحقوق، تواصل معنا عبر البريد الإلكتروني: "
            : "To exercise any of these rights, contact us at: "}
          <a href={`mailto:${contactEmail}`}>{contactEmail}</a>
        </p>

        <h2>{isAr ? "تقديم شكوى" : "Right to Lodge a Complaint"}</h2>
        <p>
          {isAr
            ? "إذا كنت تعتقد أن معالجتنا لبياناتك الشخصية تنتهك قوانين حماية البيانات، يحق لك تقديم شكوى إلى هيئة حماية البيانات المختصة في بلدك."
            : "If you believe our processing of your personal data violates data protection laws, you have the right to lodge a complaint with the supervisory data protection authority in your country of residence."}
        </p>

        <h2>{isAr ? "اتصل بنا" : "Contact Us"}</h2>
        <p>
          {isAr
            ? "إذا كانت لديك أي أسئلة حول سياسة الخصوصية هذه، تواصل معنا عبر: "
            : "If you have any questions about this privacy policy, contact us at: "}
          <a href={`mailto:${contactEmail}`}>{contactEmail}</a>
        </p>
      </div>
    </div>
  );
}

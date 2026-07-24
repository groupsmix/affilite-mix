import { getCurrentSite } from "@/lib/site-context";
import { staticPageMetadata } from "@/lib/seo";
import type { Metadata } from "next";
import { isCryptoTaxAu, CryptoTaxAUPrivacy } from "../components/site-static-content";
import { JsonLd, breadcrumbJsonLd } from "../components/json-ld";
import { CalmShell } from "../components/calmroutine/shell";
import { CalmPrivacyPage } from "../components/calmroutine/privacy-view";

export async function generateMetadata(): Promise<Metadata> {
  const site = await getCurrentSite();
  const isAr = site.language === "ar";

  if (site.id === "calm-routine") {
    return staticPageMetadata({
      site,
      title: "Privacy Policy",
      description: site.pages.privacy.description,
      path: "/privacy",
    });
  }

  return staticPageMetadata({
    site,
    title: isAr ? "سياسة الخصوصية" : "Privacy Policy",
    description: isAr
      ? `سياسة الخصوصية لموقع ${site.name} — كيف نجمع بياناتك ونستخدمها ونحميها.`
      : `Privacy policy for ${site.name} — how we collect, use, and protect your information.`,
    path: "/privacy",
  });
}

export default async function PrivacyPage() {
  const site = await getCurrentSite();

  if (site.id === "calm-routine") {
    return (
      <CalmShell site={site}>
        <div className="mx-auto max-w-3xl px-6 py-10">
          <CalmPrivacyPage />
        </div>
      </CalmShell>
    );
  }

  const isAr = site.language === "ar";
  const contactEmail = site.pages.contact?.email ?? site.brand.contactEmail;
  const breadcrumbs = breadcrumbJsonLd(site, [
    { name: site.name, path: "/" },
    { name: isAr ? "سياسة الخصوصية" : "Privacy Policy", path: "/privacy" },
  ]);

  if (isCryptoTaxAu(site)) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-12">
        <JsonLd data={breadcrumbs} />
        <h1 className="mb-6 text-3xl font-bold">{site.pages.privacy.title}</h1>
        <div className="prose prose-gray max-w-none">
          <CryptoTaxAUPrivacy site={site} />
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      <JsonLd data={breadcrumbs} />
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
              <td>{isAr ? "365 يومًا (سنة واحدة)" : "365 days (1 year)"}</td>
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
          <li>
            {isAr
              ? "بيانات النقرات التابعة: 365 يومًا (يتم حذف عنوان IP بعد 30 يومًا)"
              : "Affiliate click data: 365 days (IP addresses erased after 30 days)"}
          </li>
          <li>
            {isAr
              ? "اشتراكات النشرة البريدية: حتى إلغاء الاشتراك"
              : "Newsletter subscriptions: Until you unsubscribe"}
          </li>
          <li>{isAr ? "مقاييس أداء الويب: 90 يومًا" : "Web performance metrics: 90 days"}</li>
          <li>{isAr ? "بيانات الاختبارات القصيرة: 365 يومًا" : "Quiz submissions: 365 days"}</li>
          <li>{isAr ? "أحداث Stripe: 90 يومًا" : "Stripe events: 90 days"}</li>
          <li>
            {isAr
              ? "سجل التدقيق: 365 يومًا (ساخن)، 7 سنوات (أرشيف)"
              : "Audit log: 365 days (hot), 7 years (archive)"}
          </li>
          <li>
            {isAr
              ? "سجلات الموافقة: 7 سنوات (لإثبات الأساس القانوني)"
              : "Consent records: 7 years (to demonstrate lawful basis)"}
          </li>
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
              ? "استضافة قاعدة البيانات وتخزين البيانات (الاتحاد الأوروبي — فرانكفورت)"
              : "Database hosting and data storage (EU — Frankfurt)"}
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
          <li>
            <strong>{isAr ? "مزودو الذكاء الاصطناعي:" : "AI providers:"}</strong>{" "}
            {isAr
              ? "نستخدم مزودي ذكاء اصطناعي (Cloudflare AI وGoogle Gemini وGroq وCohere) لإنشاء المحتوى فقط. لا يتم إرسال أي بيانات مستخدم إلى هذه الخدمات."
              : "We use AI providers (Cloudflare AI, Google Gemini, Groq, and Cohere) for content generation only. No user data is sent to these services."}
          </li>
        </ul>

        <h2>{isAr ? "المحتوى المُنشأ بالذكاء الاصطناعي" : "AI-Generated Content"}</h2>
        <p>
          {isAr
            ? "يتم إنشاء بعض المحتوى على هذا الموقع بمساعدة الذكاء الاصطناعي ومراجعته من قبل محرر بشري قبل النشر. يتم تمييز المحتوى المُنشأ بالذكاء الاصطناعي بوضوح. لا يتم استخدام بياناتك الشخصية كمدخلات لنماذج الذكاء الاصطناعي."
            : "Some content on this site is drafted with the assistance of AI and reviewed by a human editor before publication. AI-generated content is clearly marked. Your personal data is never used as input to AI models."}
        </p>

        <h2>{isAr ? "اتخاذ القرارات الآلية" : "Automated Decision-Making"}</h2>
        <p>
          {isAr
            ? "لا نتخذ قرارات آلية تؤثر قانونيًا أو بشكل كبير عليك بموجب المادة 22 من اللائحة العامة لحماية البيانات. قد تقدم اختباراتنا توصيات بشأن المنتجات، لكن هذه اقتراحات فقط وليست قرارات ملزمة."
            : "We do not make automated decisions that produce legal or similarly significant effects on you under GDPR Article 22. Our quizzes may produce product recommendations, but these are suggestions only and not binding decisions."}
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
            ? "بموجب لوائح حماية البيانات المعمول بها (بما في ذلك اللائحة العامة لحماية البيانات)، يحق لك:"
            : "Under applicable data protection regulations (including GDPR), you have the right to:"}
        </p>
        <ul>
          <li>{isAr ? "الوصول إلى بياناتك الشخصية" : "Access your personal data"}</li>
          <li>{isAr ? "تصحيح البيانات غير الدقيقة" : "Rectify inaccurate data"}</li>
          <li>{isAr ? "طلب حذف بياناتك" : "Request erasure of your data"}</li>
          <li>{isAr ? "الاعتراض على المعالجة" : "Object to processing"}</li>
          <li>{isAr ? "تقييد المعالجة" : "Restriction of processing"}</li>
          <li>{isAr ? "نقل البيانات" : "Data portability"}</li>
          <li>{isAr ? "سحب الموافقة في أي وقت" : "Withdraw consent at any time"}</li>
        </ul>
        <p>
          {isAr
            ? "لممارسة أي من هذه الحقوق، تواصل معنا عبر البريد الإلكتروني: "
            : "To exercise any of these rights, contact us at: "}
          <a href={`mailto:${contactEmail}`}>{contactEmail}</a>
        </p>

        <h2>{isAr ? "حقوق سكان كاليفورنيا (CCPA/CPRA)" : "California Residents (CCPA/CPRA)"}</h2>
        <p>
          {isAr
            ? "إذا كنت مقيمًا في كاليفورنيا، فلديك حقوق إضافية بموجب قانون خصوصية المستهلك في كاليفورنيا (CCPA) وقانون حقوق الخصوصية في كاليفورنيا (CPRA):"
            : "If you are a California resident, you have additional rights under the California Consumer Privacy Act (CCPA) and California Privacy Rights Act (CPRA):"}
        </p>
        <ul>
          <li>
            {isAr
              ? "الحق في معرفة المعلومات الشخصية التي نجمعها ونستخدمها ونفصح عنها"
              : "The right to know what personal information we collect, use, and disclose"}
          </li>
          <li>
            {isAr
              ? "الحق في حذف معلوماتك الشخصية"
              : "The right to delete your personal information"}
          </li>
          <li>
            {isAr
              ? "الحق في تصحيح المعلومات الشخصية غير الدقيقة"
              : "The right to correct inaccurate personal information"}
          </li>
          <li>
            {isAr
              ? "الحق في إلغاء الاشتراك في بيع أو مشاركة المعلومات الشخصية"
              : "The right to opt out of the sale or sharing of personal information"}
          </li>
          <li>
            {isAr
              ? "الحق في عدم التمييز بسبب ممارسة حقوق الخصوصية"
              : "The right to non-discrimination for exercising privacy rights"}
          </li>
        </ul>
        <p>
          {isAr
            ? "نحن لا نبيع أو نشارك معلوماتك الشخصية كما هو محدد في CCPA/CPRA. تتبع الشركاء التابعين يُستخدم لإسناد العمولات فقط ولا يشكل بيعًا أو مشاركة للمعلومات الشخصية. نحن لا نعالج معلومات شخصية حساسة كما هو محدد في قسم 1798.121 من CPRA. نحن نحترم إشارة Global Privacy Control (GPC) ونعاملها كطلب إلغاء اشتراك."
            : "We do not sell or share your personal information as defined by CCPA/CPRA. Affiliate tracking is used for commission attribution only and does not constitute a sale or sharing of personal information. We do not process sensitive personal information as defined in CPRA Section 1798.121. We honor the Global Privacy Control (GPC) signal and treat it as an opt-out request."}
        </p>
        <h3>
          {isAr
            ? "فئات المعلومات الشخصية المُجمَّعة"
            : "Categories of Personal Information Collected"}
        </h3>
        <table>
          <thead>
            <tr>
              <th>{isAr ? "الفئة" : "Category"}</th>
              <th>{isAr ? "الغرض" : "Purpose"}</th>
              <th>{isAr ? "مشاركة مع أطراف ثالثة" : "Third-Party Sharing"}</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>{isAr ? "المعرّفات (البريد الإلكتروني)" : "Identifiers (email)"}</td>
              <td>
                {isAr
                  ? "النشرة البريدية، تنبيهات الأسعار، التعليقات"
                  : "Newsletter, price alerts, comments"}
              </td>
              <td>
                {isAr
                  ? "Resend (توصيل البريد)، Supabase (تخزين)"
                  : "Resend (email delivery), Supabase (storage)"}
              </td>
            </tr>
            <tr>
              <td>
                {isAr
                  ? "نشاط الإنترنت (النقرات، مقاييس الأداء)"
                  : "Internet activity (clicks, performance metrics)"}
              </td>
              <td>
                {isAr
                  ? "إسناد العمولات، تحسين الأداء"
                  : "Commission attribution, performance improvement"}
              </td>
              <td>
                {isAr
                  ? "Cloudflare (تحليلات)، Sentry (مراقبة الأخطاء)"
                  : "Cloudflare (analytics), Sentry (error monitoring)"}
              </td>
            </tr>
            <tr>
              <td>{isAr ? "الاستدلالات (تفضيلات الاختبار)" : "Inferences (quiz preferences)"}</td>
              <td>{isAr ? "توصيات المنتجات المخصصة" : "Personalized product recommendations"}</td>
              <td>{isAr ? "لا تتم المشاركة" : "Not shared"}</td>
            </tr>
            <tr>
              <td>{isAr ? "بيانات الدفع (عبر Stripe)" : "Payment data (via Stripe)"}</td>
              <td>{isAr ? "معالجة العضويات" : "Membership processing"}</td>
              <td>Stripe</td>
            </tr>
          </tbody>
        </table>

        <h2>{isAr ? "بيانات الأطفال" : "Children\u2019s Privacy"}</h2>
        <p>
          {isAr
            ? "خدماتنا غير موجهة للأطفال دون سن 16 عامًا (وفقًا للائحة العامة لحماية البيانات) أو 13 عامًا (وفقًا لقانون COPPA). نحن لا نجمع عن علم معلومات شخصية من الأطفال. إذا علمت أن طفلاً قد زودنا ببيانات شخصية، يرجى التواصل معنا وسنحذفها فورًا."
            : "Our services are not directed to children under 16 (GDPR-K) or under 13 (COPPA). We do not knowingly collect personal information from children. If you become aware that a child has provided us with personal data, please contact us and we will promptly delete it."}
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

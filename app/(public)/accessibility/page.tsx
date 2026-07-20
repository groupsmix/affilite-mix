import { getCurrentSite } from "@/lib/site-context";
import { staticPageMetadata } from "@/lib/seo";
import type { Metadata } from "next";
import { JsonLd, breadcrumbJsonLd } from "../components/json-ld";

export async function generateMetadata(): Promise<Metadata> {
  const site = await getCurrentSite();
  const isAr = site.language === "ar";
  return staticPageMetadata({
    site,
    title: isAr ? "بيان إمكانية الوصول" : "Accessibility Statement",
    description: isAr
      ? "التزامنا بإمكانية الوصول الرقمي — التوافق مع WCAG 2.2 AA، القيود المعروفة، وكيفية التواصل معنا."
      : "Our commitment to web accessibility — WCAG 2.2 AA conformance, known limitations, and how to contact us.",
    path: "/accessibility",
  });
}

export default async function AccessibilityPage() {
  const site = await getCurrentSite();
  const isArabic = site.language === "ar";
  const breadcrumbs = breadcrumbJsonLd(site, [
    { name: site.name, path: "/" },
    { name: isArabic ? "بيان إمكانية الوصول" : "Accessibility Statement", path: "/accessibility" },
  ]);

  return (
    <div
      className={`mx-auto max-w-3xl px-4 py-12 ${isArabic ? "rtl text-right" : ""}`}
      dir={isArabic ? "rtl" : "ltr"}
    >
      <JsonLd data={breadcrumbs} />
      <h1 className="mb-6 text-3xl font-bold">
        {isArabic ? "بيان إمكانية الوصول" : "Accessibility Statement"}
      </h1>
      <div className={`prose prose-gray max-w-none ${isArabic ? "prose-rtl" : ""}`}>
        <p>
          {isArabic
            ? "نحن ملتزمون بضمان إمكانية الوصول الرقمي للأشخاص ذوي الإعاقة. نعمل باستمرار على تحسين تجربة المستخدم للجميع وتطبيق معايير إمكانية الوصول ذات الصلة."
            : "We are committed to ensuring digital accessibility for people with disabilities. We continually improve the user experience for everyone and apply relevant accessibility standards."}
        </p>

        <h2>{isArabic ? "حالة التوافق" : "Conformance Status"}</h2>
        <p>
          {isArabic ? (
            <>
              نهدف إلى التوافق مع <strong>WCAG 2.2 المستوى AA</strong> عبر هذا الموقع. حيث نقصر،
              نعمل بنشاط على معالجة الفجوات المحددة في سجل تدقيق إمكانية الوصول لدينا.
            </>
          ) : (
            <>
              We aim for <strong>WCAG 2.2 Level AA</strong> conformance across this website. Where
              we fall short, we are actively working to resolve the gaps identified in our
              accessibility audit log.
            </>
          )}
        </p>

        <h2>{isArabic ? "المواصفات التقنية" : "Technical Specifications"}</h2>
        <p>
          {isArabic
            ? "يعتمد هذا الموقع على التقنيات التالية للتوافق مع WCAG 2.2:"
            : "This website relies on the following technologies for conformance with WCAG 2.2:"}
        </p>
        <ul>
          {isArabic ? (
            <>
              <li>ترميز HTML5 الدلالي</li>
              <li>أدوار معالم WAI-ARIA والمناطق الحية</li>
              <li>CSS بتباين ألوان كافٍ (4.5:1 كحد أدنى للنص العادي)</li>
              <li>JavaScript (تحسين تدريجي — المحتوى الأساسي متاح بدون JS)</li>
            </>
          ) : (
            <>
              <li>HTML5 semantic markup</li>
              <li>WAI-ARIA landmark roles and live regions</li>
              <li>CSS with sufficient colour contrast (minimum 4.5:1 for normal text)</li>
              <li>JavaScript (progressive enhancement — core content accessible without JS)</li>
            </>
          )}
        </ul>

        <h2>{isArabic ? "القيود المعروفة" : "Known Limitations"}</h2>
        <ul>
          {isArabic ? (
            <>
              <li>
                <strong>إطارات الإعلانات الخارجية:</strong> قد لا تتوافق إطارات الإعلانات المعزولة
                بالكامل مع WCAG 2.2. نطلب من شركاء الإعلانات اتباع إرشادات إمكانية الوصول ومراجعة
                الإعلانات الجديدة.
              </li>
              <li>
                <strong>شريط الموافقة على ملفات تعريف الارتباط:</strong> مكتبة vanilla-cookieconsent
                قابلة للتنقل عبر لوحة المفاتيح ولكنها قد لا تعلن عن تغييرات المحتوى الديناميكية
                لجميع قارئات الشاشة. ترقية كاملة إلى CMP معتمدة من TCF مخطط لها.
              </li>
              <li>
                <strong>مخططات سجل الأسعار:</strong> تتضمن مخططات SVG التفاعلية سمات aria-label
                ولكنها قد تفتقر إلى بدائل جدولية في المتصفحات القديمة. تتوفر ملخصات نصية أسفل كل
                مخطط.
              </li>
            </>
          ) : (
            <>
              <li>
                <strong>Third-party ad slots:</strong> Sandboxed ad iframes may not fully conform to
                WCAG 2.2. We ask ad partners to follow accessibility guidelines and review new
                creatives.
              </li>
              <li>
                <strong>Cookie consent banner:</strong> The vanilla-cookieconsent library is
                keyboard-navigable but may not announce dynamic content changes to all screen
                readers. A full TCF-certified CMP upgrade is planned.
              </li>
              <li>
                <strong>Price history charts:</strong> Interactive SVG charts include aria-label
                attributes but may lack table alternatives on older browsers. Text summaries are
                available below each chart.
              </li>
            </>
          )}
        </ul>

        <h2>{isArabic ? "الملاحظات والتواصل" : "Feedback and Contact"}</h2>
        <p>
          {isArabic
            ? "نرحب بملاحظاتك حول إمكانية الوصول إلى هذا الموقع. إذا واجهت أي عوائق في إمكانية الوصول، يرجى التواصل معنا:"
            : "We welcome feedback on the accessibility of this website. If you experience accessibility barriers, please contact us:"}
        </p>
        <ul>
          <li>
            <strong>{isArabic ? "البريد الإلكتروني:" : "Email:"}</strong>{" "}
            <a href="mailto:accessibility@groupsmix.com">accessibility@groupsmix.com</a>
          </li>
          <li>
            <strong>{isArabic ? "وقت الاستجابة:" : "Response time:"}</strong>{" "}
            {isArabic
              ? "نهدف إلى الرد خلال 5 أيام عمل."
              : "We aim to respond within 5 business days."}
          </li>
        </ul>

        <h2>{isArabic ? "الشكاوى الرسمية" : "Formal Complaints"}</h2>
        <p>
          {isArabic
            ? "إذا لم تكن راضياً عن ردنا، يمكنك التواصل مع الجهة الوطنية ذات الصلة لإنفاذ إمكانية الوصول في نطاقك القضائي."
            : "If you are not satisfied with our response, you may contact the relevant national accessibility enforcement body in your jurisdiction."}
        </p>

        <h2>{isArabic ? "نهج التقييم" : "Assessment Approach"}</h2>
        <p>
          {isArabic
            ? "نقيّم إمكانية الوصول إلى هذا الموقع من خلال:"
            : "We assess the accessibility of this website through:"}
        </p>
        <ul>
          {isArabic ? (
            <>
              <li>التقييم الذاتي باستخدام أدوات Axe و Lighthouse و WAVE الآلية</li>
              <li>اختبار التنقل عبر لوحة المفاتيح يدوياً</li>
              <li>اختبار قارئات الشاشة (NVDA على ويندوز، VoiceOver على macOS/iOS)</li>
              <li>
                تدقيق سنوي مستقل لإمكانية الوصول (انظر <code>docs/a11y/</code>)
              </li>
            </>
          ) : (
            <>
              <li>Self-evaluation using Axe, Lighthouse, and WAVE automated tools</li>
              <li>Manual keyboard-navigation testing</li>
              <li>Screen-reader testing (NVDA on Windows, VoiceOver on macOS/iOS)</li>
              <li>
                Annual third-party accessibility audit (see <code>docs/a11y/</code>)
              </li>
            </>
          )}
        </ul>

        <p className="text-sm text-gray-500 mt-8">
          {isArabic ? (
            <>
              تم إعداد هذا البيان في <time dateTime="2026-05-01">1 مايو 2026</time> وآخر مراجعة له
              في <time dateTime="2026-05-01">1 مايو 2026</time>.
            </>
          ) : (
            <>
              This statement was prepared on <time dateTime="2026-05-01">1 May 2026</time> and last
              reviewed on <time dateTime="2026-05-01">1 May 2026</time>.
            </>
          )}
        </p>
      </div>
    </div>
  );
}

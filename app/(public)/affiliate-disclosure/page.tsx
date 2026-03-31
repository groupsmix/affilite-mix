import type { Metadata } from "next";
import { getCurrentSite } from "@/lib/site-context";
import { Breadcrumbs } from "../components/breadcrumbs";
import { JsonLd, breadcrumbJsonLd } from "../components/json-ld";
import { redirect } from "next/navigation";
import Link from "next/link";

export const revalidate = 3600;

export async function generateMetadata(): Promise<Metadata> {
  const site = await getCurrentSite();
  const disclosurePage = site.pages.affiliateDisclosurePage;

  if (!disclosurePage) {
    return { title: "Not Found" };
  }

  const isAr = site.language === "ar";
  const title = isAr ? "إفصاح الشراكة" : disclosurePage.title;
  const description = isAr
    ? "تعرّف على كيفية عمل روابط الشراكة التابعة على موقعنا وسياستنا التحريرية."
    : disclosurePage.description;
  const url = `https://${site.domain}/affiliate-disclosure`;

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

export default async function AffiliateDisclosurePage() {
  const site = await getCurrentSite();
  const disclosurePage = site.pages.affiliateDisclosurePage;

  if (!disclosurePage) {
    redirect("/");
  }

  const isAr = site.language === "ar";

  const breadcrumbs = breadcrumbJsonLd(site, [
    { name: site.name, path: "/" },
    { name: isAr ? "إفصاح الشراكة" : disclosurePage.title, path: "/affiliate-disclosure" },
  ]);

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <JsonLd data={breadcrumbs} />

      <Breadcrumbs
        items={[
          { label: site.name, href: "/" },
          { label: isAr ? "إفصاح الشراكة" : disclosurePage.title },
        ]}
      />

      <header className="mb-8">
        <h1 className="mb-2 text-3xl font-bold">
          {isAr ? "إفصاح الشراكة" : disclosurePage.title}
        </h1>
        <p className="text-gray-600">
          {isAr
            ? "تعرّف على كيفية عمل روابط الشراكة التابعة على موقعنا وسياستنا التحريرية."
            : disclosurePage.description}
        </p>
      </header>

      <div className="prose max-w-none">
        <h2>{isAr ? "كيف نحقق الإيرادات" : "How We Earn Revenue"}</h2>
        <p>
          {isAr
            ? `${site.name} مشارك في برامج شراكة متنوعة، بما في ذلك برنامج أمازون للشركاء التابعين. هذا يعني أنه عند النقر على روابط معينة على موقعنا وإجراء عملية شراء، قد نحصل على عمولة صغيرة دون أي تكلفة إضافية عليك.`
            : `${site.name} is a participant in various affiliate programs, including the Amazon Associates Program. This means that when you click on certain links on our site and make a purchase, we may earn a small commission at no additional cost to you.`}
        </p>

        <h2>{isAr ? "سياستنا التحريرية" : "Our Editorial Policy"}</h2>
        <p>
          {isAr
            ? "تستند مراجعاتنا وتوصياتنا إلى تقييماتنا التحريرية الصادقة ولا تتأثر بشراكات الإحالة. نحن نوصي فقط بالمنتجات التي نؤمن بأنها تقدم قيمة حقيقية لقرائنا."
            : "Our reviews and recommendations are based on our honest editorial assessments and are not influenced by affiliate partnerships. We only recommend products that we believe provide genuine value to our readers."}
        </p>
        <p>
          {isAr
            ? "وجود أو عدم وجود رابط تابع لا يؤثر على حكمنا التحريري. يتم مراجعة المنتجات وتقييمها بناءً على جودتها، بغض النظر عما إذا كنا نحصل على عمولة منها."
            : "The presence or absence of an affiliate link does not affect our editorial judgment. Products are reviewed and rated based on their merits, regardless of whether we earn a commission from them."}
        </p>

        <h2>{isAr ? "ماذا يعني هذا لك" : "What This Means for You"}</h2>
        <ul>
          <li>
            <strong>{isAr ? "بدون تكلفة إضافية:" : "No extra cost:"}</strong>{" "}
            {isAr
              ? "تدفع نفس السعر سواء استخدمت رابط الشراكة الخاص بنا أو ذهبت مباشرة إلى البائع."
              : "You pay the same price whether you use our affiliate link or go directly to the retailer."}
          </li>
          <li>
            <strong>{isAr ? "مراجعات صادقة:" : "Honest reviews:"}</strong>{" "}
            {isAr
              ? "علاقات الشراكة لا تؤثر أبدًا على تقييماتنا أو توصياتنا."
              : "Affiliate relationships never influence our ratings or recommendations."}
          </li>
          <li>
            <strong>{isAr ? "الشفافية:" : "Transparency:"}</strong>{" "}
            {isAr
              ? "الصفحات التي تحتوي على روابط تابعة مميزة بوضوح بإشعار إفصاح."
              : "Pages containing affiliate links are clearly marked with a disclosure notice."}
          </li>
          <li>
            <strong>{isAr ? "دعم عملنا:" : "Supporting our work:"}</strong>{" "}
            {isAr
              ? "استخدام روابطنا يساعدنا على الاستمرار في إنشاء محتوى مجاني ومتعمق لك."
              : "Using our links helps us continue creating free, in-depth content for you."}
          </li>
        </ul>

        <h2>{isAr ? "إشعار الإفصاح" : "Disclosure Notice"}</h2>
        <p>
          {isAr
            ? "في جميع أنحاء الموقع، سترى الإفصاح التالي على الصفحات التي تحتوي على روابط تابعة:"
            : "Throughout the site, you will see the following disclosure on pages that contain affiliate links:"}
        </p>
        <blockquote>
          <p>{site.affiliateDisclosure}</p>
        </blockquote>

        <h2>{isAr ? "أسئلة؟" : "Questions?"}</h2>
        <p>
          {isAr ? (
            <>
              إذا كانت لديك أي أسئلة حول علاقات الشراكة أو سياستنا التحريرية، يرجى{" "}
              {site.pages.contact ? (
                <Link
                  href="/contact"
                  className="font-medium transition-colors"
                  style={{ color: "var(--color-accent, #10B981)" }}
                >
                  التواصل معنا
                </Link>
              ) : (
                <>
                  مراسلتنا عبر البريد الإلكتروني على{" "}
                  <a
                    href={`mailto:${site.brand.contactEmail}`}
                    className="font-medium transition-colors"
                    style={{ color: "var(--color-accent, #10B981)" }}
                  >
                    {site.brand.contactEmail}
                  </a>
                </>
              )}
              .
            </>
          ) : (
            <>
              If you have any questions about our affiliate relationships or
              editorial policy, please{" "}
              {site.pages.contact ? (
                <Link
                  href="/contact"
                  className="font-medium transition-colors"
                  style={{ color: "var(--color-accent, #10B981)" }}
                >
                  contact us
                </Link>
              ) : (
                <>
                  email us at{" "}
                  <a
                    href={`mailto:${site.brand.contactEmail}`}
                    className="font-medium transition-colors"
                    style={{ color: "var(--color-accent, #10B981)" }}
                  >
                    {site.brand.contactEmail}
                  </a>
                </>
              )}
              .
            </>
          )}
        </p>
      </div>
    </div>
  );
}

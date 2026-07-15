import { requireSiteFeature } from "@/lib/site-features";
import { staticPageMetadata } from "@/lib/seo";
import type { Metadata } from "next";

export async function generateMetadata(): Promise<Metadata> {
  const site = await requireSiteFeature("mediaKit");
  const isAr = site.language === "ar";
  return staticPageMetadata({
    site,
    title: isAr ? "حقيبة الإعلام" : "Media Kit",
    description: isAr
      ? `اشترك مع ${site.name}. إحصاءات الزيارات، التركيبة السكانية للجمهور، أسعار الإعلان، وفرص الرعاية.`
      : `Partner with ${site.name}. Traffic stats, audience demographics, ad rates, and sponsorship opportunities.`,
    path: "/media-kit",
  });
}

export default async function MediaKitPage() {
  const site = await requireSiteFeature("mediaKit");
  const isAr = site.language === "ar";

  const stats = [
    {
      label: isAr ? "زوار شهرياً" : "Monthly Visitors",
      value: "—",
      note: isAr ? "في نمو" : "Growing",
    },
    {
      label: isAr ? "مشتركو البريد" : "Email Subscribers",
      value: "—",
      note: isAr ? "متفاعلون" : "Engaged",
    },
    {
      label: isAr ? "متوسط الوقت على الموقع" : "Avg. Time on Site",
      value: "—",
      note: isAr ? "حركة عالية الجودة" : "Quality traffic",
    },
    {
      label: isAr ? "صفحات لكل جلسة" : "Pages per Session",
      value: "—",
      note: isAr ? "تفاعل عميق" : "Deep engagement",
    },
  ];

  const ageRows: Array<[string, string]> = [
    ["25-34", "35%"],
    ["35-44", "30%"],
    ["45-54", "20%"],
    ["18-24", "10%"],
    ["55+", "5%"],
  ];

  const marketRows: Array<[string, string]> = [
    [isAr ? "الولايات المتحدة" : "United States", "40%"],
    [isAr ? "المملكة المتحدة" : "United Kingdom", "15%"],
    [isAr ? "ألمانيا" : "Germany", "8%"],
    [isAr ? "كندا" : "Canada", "7%"],
    [isAr ? "أستراليا" : "Australia", "5%"],
  ];

  const opportunities = [
    {
      title: isAr ? "مراجعة برعاية" : "Sponsored Review",
      description: isAr
        ? "مراجعة عملية متعمقة لساعتك من قبل فريقنا التحريري الخبير. تشمل تصويراً عالي الجودة وفيديو وتوزيعاً اجتماعياً."
        : "In-depth, hands-on review of your timepiece by our expert editorial team. Includes high-quality photography, video, and social distribution.",
      cta: isAr ? "ابتداءً من 2,000$" : "From $2,000",
    },
    {
      title: isAr ? "إبراز في النشرة البريدية" : "Newsletter Spotlight",
      description: isAr
        ? "موضع مميز في نشرتنا الأسبوعية للعروض، يصل إلى مشتركين متفاعلين مع نية شراء عالية."
        : "Featured placement in our weekly deals newsletter reaching engaged subscribers with high purchase intent.",
      cta: isAr ? "ابتداءً من 500$" : "From $500",
    },
    {
      title: isAr ? "إبراز العلامة التجارية" : "Brand Spotlight",
      description: isAr
        ? "صفحة علامة تجارية مخصصة مع محتوى تحريري، ودمج فهرس المنتجات، وزيارات مستمرة من تحسين محركات البحث."
        : "Dedicated brand page with editorial content, product catalog integration, and ongoing traffic from SEO.",
      cta: isAr ? "تسعير مخصص" : "Custom pricing",
    },
  ];

  return (
    <div className="mx-auto max-w-4xl px-4 py-12" dir={isAr ? "rtl" : "ltr"}>
      {/* Hero */}
      <div className="mb-12 text-center">
        <h1 className="text-4xl font-bold text-gray-900">{isAr ? "حقيبة الإعلام" : "Media Kit"}</h1>
        <p className="mx-auto mt-3 max-w-2xl text-lg text-gray-600">
          {isAr ? (
            <>اشترك مع {site.name} — الوجهة الموثوقة لعشاق الساعات والجامعين والمشترين.</>
          ) : (
            <>
              Partner with {site.name} — the trusted destination for watch enthusiasts, collectors,
              and buyers.
            </>
          )}
        </p>
      </div>

      {/* Audience Stats */}
      <section className="mb-12">
        <h2 className="mb-6 text-2xl font-bold text-gray-900">
          {isAr ? "جمهورنا" : "Our Audience"}
        </h2>
        <div className="grid grid-cols-2 gap-6 sm:grid-cols-4">
          {stats.map((stat) => (
            <div key={stat.label} className="rounded-lg border bg-white p-5 text-center shadow-sm">
              <p className="text-3xl font-bold text-gray-900">{stat.value}</p>
              <p className="mt-1 text-sm font-medium text-gray-700">{stat.label}</p>
              <p className="mt-0.5 text-xs text-gray-400">{stat.note}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Demographics */}
      <section className="mb-12">
        <h2 className="mb-6 text-2xl font-bold text-gray-900">
          {isAr ? "التركيبة السكانية" : "Demographics"}
        </h2>
        <div className="grid gap-6 sm:grid-cols-2">
          <div className="rounded-lg border bg-white p-6">
            <h3 className="font-semibold text-gray-900">
              {isAr ? "توزيع الأعمار" : "Age Distribution"}
            </h3>
            <ul className="mt-3 space-y-2 text-sm text-gray-700">
              {ageRows.map(([range, pct]) => (
                <li key={range} className="flex justify-between">
                  <span>{range}</span>
                  <span className="font-medium">{pct}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-lg border bg-white p-6">
            <h3 className="font-semibold text-gray-900">{isAr ? "أهم الأسواق" : "Top Markets"}</h3>
            <ul className="mt-3 space-y-2 text-sm text-gray-700">
              {marketRows.map(([market, pct]) => (
                <li key={market} className="flex justify-between">
                  <span>{market}</span>
                  <span className="font-medium">{pct}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
        <p className="mt-4 text-sm text-gray-500">
          {isAr
            ? "جمهورنا في الغالب من الذكور (75%)، ميسوري الحال (دخل أسري 80 ألف دولار+)، مع نية شراء قوية. مشترو ساعات في نطاق 200 إلى 20,000 دولار."
            : "Our audience skews male (75%), affluent (HHI $80k+), with strong purchase intent. Watch buyers in the $200–$20,000 range."}
        </p>
      </section>

      {/* Partnership Opportunities */}
      <section className="mb-12">
        <h2 className="mb-6 text-2xl font-bold text-gray-900">
          {isAr ? "فرص الشراكة" : "Partnership Opportunities"}
        </h2>
        <div className="grid gap-6 sm:grid-cols-3">
          {opportunities.map((opportunity) => (
            <div key={opportunity.title} className="rounded-lg border bg-white p-6 shadow-sm">
              <h3 className="text-lg font-semibold text-gray-900">{opportunity.title}</h3>
              <p className="mt-2 text-sm text-gray-600">{opportunity.description}</p>
              <p className="mt-4 text-sm font-bold text-blue-600">{opportunity.cta}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Why Partner */}
      <section className="mb-12 rounded-lg bg-gray-50 p-8">
        <h2 className="mb-4 text-2xl font-bold text-gray-900">
          {isAr ? "لماذا تشترك معنا" : "Why Partner With Us"}
        </h2>
        <ul className="space-y-3 text-gray-700">
          <li className="flex items-start gap-3">
            <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-blue-600" />
            <span>
              {isAr ? (
                <>
                  <strong>فريق تحريري خبير</strong> بخبرة حقيقية في الساعات — لا محتوى مولّد بالذكاء
                  الاصطناعي. كل مراجعة عملية بتصوير أصلي.
                </>
              ) : (
                <>
                  <strong>Expert editorial team</strong> with real watch expertise — not
                  AI-generated content. Every review is hands-on with genuine photography.
                </>
              )}
            </span>
          </li>
          <li className="flex items-start gap-3">
            <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-blue-600" />
            <span>
              {isAr ? (
                <>
                  <strong>جمهور بنية شراء عالية</strong> — قراؤنا يتسوقون فعلياً، لا يتصفحون فقط.
                  متوسط قيمة الطلب في نطاق 500 إلى 5,000 دولار.
                </>
              ) : (
                <>
                  <strong>High purchase intent audience</strong> — our readers are actively
                  shopping, not just browsing. Average order value in the $500-$5,000 range.
                </>
              )}
            </span>
          </li>
          <li className="flex items-start gap-3">
            <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-blue-600" />
            <span>
              {isAr ? (
                <>
                  <strong>التزام كامل بالإفصاح من FTC و ASA</strong> — كل المحتوى المدعوم يُوسم
                  بوضوح. نحمي سمعة علامتك التجارية.
                </>
              ) : (
                <>
                  <strong>Full FTC/ASA disclosure compliance</strong> — all sponsored content is
                  clearly labeled. We protect your brand reputation.
                </>
              )}
            </span>
          </li>
          <li className="flex items-start gap-3">
            <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-blue-600" />
            <span>
              {isAr ? (
                <>
                  <strong>تقارير أداء تفصيلية</strong> — تحصل على رؤية كاملة للمشاهدات والنقرات
                  وإسناد التحويل.
                </>
              ) : (
                <>
                  <strong>Detailed performance reporting</strong> — you get full visibility into
                  impressions, clicks, and conversion attribution.
                </>
              )}
            </span>
          </li>
        </ul>
      </section>

      {/* Contact CTA */}
      <section className="rounded-lg border-2 border-blue-100 bg-blue-50 p-8 text-center">
        <h2 className="text-2xl font-bold text-gray-900">{isAr ? "لنتحدث" : "Let\u2019s Talk"}</h2>
        <p className="mt-2 text-gray-600">
          {isAr ? (
            <>هل أنت مهتم بالشراكة مع {site.name}؟ تواصل مع فريق الشراكات لدينا.</>
          ) : (
            <>Interested in partnering with {site.name}? Get in touch with our partnerships team.</>
          )}
        </p>
        <a
          href={`mailto:${site.brand.contactEmail}?subject=${encodeURIComponent(
            isAr ? `استفسار شراكة — ${site.name}` : `Partnership Inquiry — ${site.name}`,
          )}`}
          className="mt-4 inline-block rounded-md bg-blue-600 px-8 py-3 text-lg font-semibold text-white transition-colors hover:bg-blue-700"
        >
          {isAr ? "تواصل معنا" : "Contact Us"}
        </a>
        <p className="mt-3 text-sm text-gray-500">{site.brand.contactEmail}</p>
      </section>
    </div>
  );
}

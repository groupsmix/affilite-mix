import { getCurrentSite } from "@/lib/site-context";
import type { Metadata } from "next";

export async function generateMetadata(): Promise<Metadata> {
  const site = await getCurrentSite();
  return {
    title: `Media Kit — ${site.name}`,
    description: `Partner with ${site.name}. Traffic stats, audience demographics, ad rates, and sponsorship opportunities.`,
  };
}

export default async function MediaKitPage() {
  const site = await getCurrentSite();

  return (
    <div className="mx-auto max-w-4xl px-4 py-12">
      {/* Hero */}
      <div className="mb-12 text-center">
        <h1 className="text-4xl font-bold text-gray-900">Media Kit</h1>
        <p className="mx-auto mt-3 max-w-2xl text-lg text-gray-600">
          Partner with {site.name} — the trusted destination for watch enthusiasts, collectors, and
          buyers.
        </p>
      </div>

      {/* Audience Stats */}
      <section className="mb-12">
        <h2 className="mb-6 text-2xl font-bold text-gray-900">Our Audience</h2>
        <div className="grid grid-cols-2 gap-6 sm:grid-cols-4">
          {[
            { label: "Monthly Visitors", value: "—", note: "Growing" },
            { label: "Email Subscribers", value: "—", note: "Engaged" },
            { label: "Avg. Time on Site", value: "—", note: "Quality traffic" },
            { label: "Pages per Session", value: "—", note: "Deep engagement" },
          ].map((stat) => (
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
        <h2 className="mb-6 text-2xl font-bold text-gray-900">Demographics</h2>
        <div className="grid gap-6 sm:grid-cols-2">
          <div className="rounded-lg border bg-white p-6">
            <h3 className="font-semibold text-gray-900">Age Distribution</h3>
            <ul className="mt-3 space-y-2 text-sm text-gray-700">
              <li className="flex justify-between">
                <span>25-34</span>
                <span className="font-medium">35%</span>
              </li>
              <li className="flex justify-between">
                <span>35-44</span>
                <span className="font-medium">30%</span>
              </li>
              <li className="flex justify-between">
                <span>45-54</span>
                <span className="font-medium">20%</span>
              </li>
              <li className="flex justify-between">
                <span>18-24</span>
                <span className="font-medium">10%</span>
              </li>
              <li className="flex justify-between">
                <span>55+</span>
                <span className="font-medium">5%</span>
              </li>
            </ul>
          </div>
          <div className="rounded-lg border bg-white p-6">
            <h3 className="font-semibold text-gray-900">Top Markets</h3>
            <ul className="mt-3 space-y-2 text-sm text-gray-700">
              <li className="flex justify-between">
                <span>United States</span>
                <span className="font-medium">40%</span>
              </li>
              <li className="flex justify-between">
                <span>United Kingdom</span>
                <span className="font-medium">15%</span>
              </li>
              <li className="flex justify-between">
                <span>Germany</span>
                <span className="font-medium">8%</span>
              </li>
              <li className="flex justify-between">
                <span>Canada</span>
                <span className="font-medium">7%</span>
              </li>
              <li className="flex justify-between">
                <span>Australia</span>
                <span className="font-medium">5%</span>
              </li>
            </ul>
          </div>
        </div>
        <p className="mt-4 text-sm text-gray-500">
          Our audience skews male (75%), affluent (HHI $80k+), with strong purchase intent. Watch
          buyers in the $200–$20,000 range.
        </p>
      </section>

      {/* Partnership Opportunities */}
      <section className="mb-12">
        <h2 className="mb-6 text-2xl font-bold text-gray-900">Partnership Opportunities</h2>
        <div className="grid gap-6 sm:grid-cols-3">
          {[
            {
              title: "Sponsored Review",
              description:
                "In-depth, hands-on review of your timepiece by our expert editorial team. Includes high-quality photography, video, and social distribution.",
              cta: "From $2,000",
            },
            {
              title: "Newsletter Spotlight",
              description:
                "Featured placement in our weekly deals newsletter reaching engaged subscribers with high purchase intent.",
              cta: "From $500",
            },
            {
              title: "Brand Spotlight",
              description:
                "Dedicated brand page with editorial content, product catalog integration, and ongoing traffic from SEO.",
              cta: "Custom pricing",
            },
          ].map((opportunity) => (
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
        <h2 className="mb-4 text-2xl font-bold text-gray-900">Why Partner With Us</h2>
        <ul className="space-y-3 text-gray-700">
          <li className="flex items-start gap-3">
            <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-blue-600" />
            <span>
              <strong>Expert editorial team</strong> with real watch expertise — not AI-generated
              content. Every review is hands-on with genuine photography.
            </span>
          </li>
          <li className="flex items-start gap-3">
            <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-blue-600" />
            <span>
              <strong>High purchase intent audience</strong> — our readers are actively shopping,
              not just browsing. Average order value in the $500-$5,000 range.
            </span>
          </li>
          <li className="flex items-start gap-3">
            <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-blue-600" />
            <span>
              <strong>Full FTC/ASA disclosure compliance</strong> — all sponsored content is clearly
              labeled. We protect your brand reputation.
            </span>
          </li>
          <li className="flex items-start gap-3">
            <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-blue-600" />
            <span>
              <strong>Detailed performance reporting</strong> — you get full visibility into
              impressions, clicks, and conversion attribution.
            </span>
          </li>
        </ul>
      </section>

      {/* Contact CTA */}
      <section className="rounded-lg border-2 border-blue-100 bg-blue-50 p-8 text-center">
        <h2 className="text-2xl font-bold text-gray-900">Let&apos;s Talk</h2>
        <p className="mt-2 text-gray-600">
          Interested in partnering with {site.name}? Get in touch with our partnerships team.
        </p>
        <a
          href={`mailto:${site.brand.contactEmail}?subject=Partnership Inquiry — ${site.name}`}
          className="mt-4 inline-block rounded-md bg-blue-600 px-8 py-3 text-lg font-semibold text-white transition-colors hover:bg-blue-700"
        >
          Contact Us
        </a>
        <p className="mt-3 text-sm text-gray-500">{site.brand.contactEmail}</p>
      </section>
    </div>
  );
}

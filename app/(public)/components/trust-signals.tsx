import { ShieldCheck, Users, Award, Newspaper, Quote } from "lucide-react";

interface TrustSignalsProps {
  affiliateDisclosure: string;
  contentDisclosure: string;
  contactEmail?: string;
}

export function TrustSignals({
  affiliateDisclosure,
  contentDisclosure,
  contactEmail,
}: TrustSignalsProps) {
  const testimonials = [
    {
      quote:
        "I had 800 DeFi transactions across three wallets. The comparison here helped me pick the right tool and I lodged two weeks early.",
      name: "Sarah M.",
      detail: "Melbourne, VIC",
    },
    {
      quote:
        "Finally a site that explains ATO rules without trying to sell me a product first. Saved me hours of confusion.",
      name: "David K.",
      detail: "Sydney, NSW",
    },
    {
      quote:
        "The side-by-side breakdown made it obvious which software handled NFTs properly. Worth bookmarking for next year.",
      name: "Priya R.",
      detail: "Brisbane, QLD",
    },
  ];

  const trustBadges = [
    { icon: ShieldCheck, label: "ATO-aligned methodology" },
    { icon: Users, label: "Independent reviews" },
    { icon: Award, label: "No sponsored rankings" },
    { icon: Newspaper, label: "Updated for FY2026" },
  ];

  return (
    <section className="border-y border-slate-200 bg-white py-12 lg:py-16">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        {/* Trust badges */}
        <div className="flex flex-wrap items-center justify-center gap-3 sm:gap-4">
          {trustBadges.map((b) => (
            <span
              key={b.label}
              className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3.5 py-1.5 text-sm font-medium text-slate-700"
            >
              <b.icon className="size-4 text-emerald-600" aria-hidden="true" />
              {b.label}
            </span>
          ))}
        </div>

        {/* As seen / recognition */}
        <div className="mt-10 text-center">
          <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">
            Recognised by Australian crypto & finance communities
          </p>
          <div className="mt-4 flex flex-wrap items-center justify-center gap-4 opacity-60 grayscale">
            {["Aussie Finance", "Crypto AU", "Tax Tech Weekly", "Bitcoin Australia"].map((name) => (
              <span
                key={name}
                className="inline-flex items-center rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700 shadow-sm"
              >
                {name}
              </span>
            ))}
          </div>
          <p className="mt-3 text-xs text-slate-400">
            Replace with your actual press logos once coverage is live.
          </p>
        </div>

        {/* Testimonials */}
        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {testimonials.map((t) => (
            <blockquote
              key={t.name}
              className="rounded-2xl border border-slate-200 bg-slate-50 p-5"
            >
              <Quote className="size-6 text-emerald-600/40" aria-hidden="true" />
              <p className="mt-3 text-sm leading-relaxed text-slate-700">&ldquo;{t.quote}&rdquo;</p>
              <footer className="mt-4 flex items-center gap-2">
                <span className="flex size-8 items-center justify-center rounded-full bg-slate-900 text-xs font-bold text-white">
                  {t.name.charAt(0)}
                </span>
                <div>
                  <p className="text-sm font-semibold text-slate-900">{t.name}</p>
                  <p className="text-xs text-slate-500">{t.detail}</p>
                </div>
              </footer>
            </blockquote>
          ))}
        </div>

        {/* Legal / disclaimers */}
        <div className="mt-10 rounded-2xl border border-slate-200 bg-slate-50 p-5 text-sm leading-relaxed text-slate-600 sm:p-6">
          <p className="font-semibold text-slate-900">Important</p>
          <p className="mt-2">{contentDisclosure}</p>
          <p className="mt-2">{affiliateDisclosure}</p>
          {contactEmail && (
            <p className="mt-2">
              Questions? Contact us at{" "}
              <a href={`mailto:${contactEmail}`} className="font-medium text-slate-900 underline">
                {contactEmail}
              </a>
              .
            </p>
          )}
        </div>
      </div>
    </section>
  );
}

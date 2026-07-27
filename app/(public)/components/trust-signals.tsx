import { ShieldCheck, Users, Award, Newspaper } from "lucide-react";

interface TrustSignalsProps {
  affiliateDisclosure: string;
  contentDisclosure: string;
  contactEmail?: string;
  stats?: {
    tools?: number;
    guides?: number;
    reviews?: number;
    categories?: number;
  };
}

export function TrustSignals({
  affiliateDisclosure,
  contentDisclosure,
  contactEmail,
  stats,
}: TrustSignalsProps) {
  const trustBadges = [
    { icon: ShieldCheck, label: "ATO-aligned methodology" },
    { icon: Users, label: "Independent reviews" },
    { icon: Award, label: "No sponsored rankings" },
    { icon: Newspaper, label: "Updated for FY2026" },
  ];

  const statItems = [
    { label: "Tools compared", value: stats?.tools },
    { label: "Tax guides", value: stats?.guides },
    { label: "Categories covered", value: stats?.categories },
    { label: "Review criteria", value: stats?.reviews },
  ].filter((item) => typeof item.value === "number" && item.value > 0);

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

        {/* Real stats */}
        {statItems.length > 0 && (
          <div className="mt-10 grid grid-cols-2 gap-4 sm:grid-cols-4">
            {statItems.map((item) => (
              <div
                key={item.label}
                className="rounded-2xl border border-slate-200 bg-slate-50 p-5 text-center"
              >
                <p className="text-3xl font-extrabold tracking-tight text-slate-900">
                  {item.value}
                </p>
                <p className="mt-1 text-sm text-slate-600">{item.label}</p>
              </div>
            ))}
          </div>
        )}

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

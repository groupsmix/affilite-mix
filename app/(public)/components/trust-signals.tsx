import { ShieldCheck, Users, Award, Newspaper } from "lucide-react";

interface TrustSignalsProps {
  stats?: {
    tools?: number;
    guides?: number;
    categories?: number;
    reviews?: number;
  };
}

export function TrustSignals({ stats }: TrustSignalsProps) {
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
        <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-sm">
          {trustBadges.map((b, i) => (
            <span key={b.label} className="inline-flex items-center gap-1.5">
              <b.icon className="size-4 text-emerald-600" aria-hidden="true" />
              <span className="font-medium text-slate-700">{b.label}</span>
              {i < trustBadges.length - 1 && (
                <span className="ml-1 text-slate-300" aria-hidden="true">
                  ·
                </span>
              )}
            </span>
          ))}
        </div>

        {statItems.length > 0 && (
          <div className="mt-10 grid grid-cols-2 gap-4 sm:grid-cols-4">
            {statItems.map((item) => (
              <div key={item.label} className="text-center">
                <p className="text-3xl font-extrabold tracking-tight text-slate-900">
                  {item.value}
                </p>
                <p className="mt-1 text-sm text-slate-600">{item.label}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

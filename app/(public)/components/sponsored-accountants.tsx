import { Star, MapPin, BadgeCheck } from "lucide-react";
import Link from "next/link";

interface Listing {
  name: string;
  location: string;
  specialties: string[];
  highlight: string;
  sponsored: boolean;
}

const ACCOUNTANTS: Listing[] = [
  {
    name: "Sydney Crypto Tax Accountants",
    location: "Sydney, NSW",
    specialties: ["DeFi", "NFTs", "ATO audits"],
    highlight: "ATO review specialists",
    sponsored: true,
  },
  {
    name: "Melbourne DeFi Tax Group",
    location: "Melbourne, VIC",
    specialties: ["Yield farming", "Staking", "Complex CGT"],
    highlight: "Book a free 15-minute call",
    sponsored: true,
  },
  {
    name: "Brisbane Web3 Tax Agents",
    location: "Brisbane, QLD",
    specialties: ["Airdrops", "Multiple years", "SMSF crypto"],
    highlight: "Registered tax agents",
    sponsored: true,
  },
];

export function SponsoredAccountants() {
  return (
    <section className="mx-auto max-w-6xl px-4 py-8 sm:py-12">
      <div className="mb-6 flex items-center justify-between">
        <h2 className="text-2xl font-bold tracking-tight text-gray-900">
          Crypto-specialist accountants
        </h2>
        <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-bold uppercase tracking-wide text-amber-700">
          Sponsored
        </span>
      </div>
      <p className="mb-6 max-w-3xl text-gray-600">
        These firms understand crypto tax and have asked us to feature them. We do not endorse any
        single firm — compare and choose the one that fits your situation.
      </p>

      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {ACCOUNTANTS.map((firm) => (
          <div
            key={firm.name}
            className="relative rounded-2xl border border-gray-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-md"
          >
            <div className="flex items-start justify-between">
              <div>
                <p className="text-lg font-bold text-gray-900">{firm.name}</p>
                <p className="mt-1 flex items-center gap-1 text-sm text-gray-500">
                  <MapPin className="size-3.5" aria-hidden="true" />
                  {firm.location}
                </p>
              </div>
              {firm.sponsored && (
                <BadgeCheck className="size-5 shrink-0 text-emerald-600" aria-hidden="true" />
              )}
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              {firm.specialties.map((specialty) => (
                <span
                  key={specialty}
                  className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700"
                >
                  {specialty}
                </span>
              ))}
            </div>

            <p className="mt-4 flex items-center gap-1.5 text-sm font-medium text-amber-700">
              <Star className="size-4 fill-amber-500 text-amber-500" aria-hidden="true" />
              {firm.highlight}
            </p>

            <Link
              href="#lead-form"
              className="mt-5 block w-full rounded-lg border border-emerald-600 bg-emerald-600 px-4 py-2.5 text-center text-sm font-semibold text-white transition-colors hover:bg-emerald-700"
            >
              Request an introduction
            </Link>
          </div>
        ))}
      </div>
    </section>
  );
}

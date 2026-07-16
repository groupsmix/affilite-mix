"use client";

import { useMemo, useState } from "react";
import { ProductCardCta } from "./product-card-client";

/**
 * A tool in the recommendation set. `slug`/`affiliateUrl` come from the seeded
 * products so the finder's outbound clicks are the same tracked affiliate links
 * used everywhere else on the site.
 */
export interface TaxFinderTool {
  slug: string;
  name: string;
  affiliateUrl: string;
  tagline: string;
}

interface TaxFinderProps {
  /** Software tools the finder can recommend (from seeded featured products). */
  tools: TaxFinderTool[];
  /** Optional crypto-accountant referral, surfaced for complex/high-volume cases. */
  accountant?: TaxFinderTool | null;
  /** Days until the 31 October self-lodgement deadline (computed server-side). */
  daysToDeadline: number;
  affiliateDisclosure: string;
  sourceType?: string;
}

type ActKey = "trade" | "defi" | "staking" | "airdrop" | "nft";
type VolKey = "low" | "mid" | "high";
type PriKey = "tax" | "simple" | "complex";

const ACTS: { k: ActKey; label: string }[] = [
  { k: "trade", label: "Bought & sold" },
  { k: "defi", label: "DeFi (swaps, LPs, lending)" },
  { k: "staking", label: "Staking rewards" },
  { k: "airdrop", label: "Airdrops" },
  { k: "nft", label: "NFTs" },
];

const VOLS: { k: VolKey; label: string }[] = [
  { k: "low", label: "Under 100" },
  { k: "mid", label: "100 – 1,000" },
  { k: "high", label: "1,000+" },
];

const PRIS: { k: PriKey; label: string }[] = [
  { k: "tax", label: "Pay the least tax" },
  { k: "simple", label: "Keep it simple" },
  { k: "complex", label: "Handle complex DeFi" },
];

/** ATO taxable-event language mapped to each activity. General info, not advice. */
const EVENTS: Record<ActKey, string[]> = {
  trade: ["Capital gains tax (CGT) on each disposal when you sell or swap"],
  defi: [
    "CGT on token swaps and entering/exiting liquidity pools",
    "Possible ordinary income on DeFi rewards & yield",
  ],
  staking: [
    "Ordinary income at the AUD value when rewards are received",
    "CGT later when you dispose of those rewards",
  ],
  airdrop: [
    "Ordinary income for established-project airdrops (market value at receipt)",
    "CGT on later disposal",
  ],
  nft: [
    "CGT on NFT sales; possible personal-use-asset treatment",
    "Income if you mint/create NFTs as a business",
  ],
};

/** Situation → best-fit tool. Returns the target product slug + the reasoning. */
function recommend(acts: Set<ActKey>, vol: VolKey | null, pri: PriKey | null) {
  if (pri === "tax") {
    return {
      slug: "syla",
      why: "You want the smallest legal bill — Syla is built only for ATO rules and picks the lowest-tax parcels (LTFO) to reduce your CGT.",
    };
  }
  if (acts.has("defi") && (vol === "high" || pri === "complex")) {
    return {
      slug: "crypto-tax-calculator",
      why: "You've got heavy or complex DeFi — Crypto Tax Calculator has the strongest DeFi categorisation and handles messy on-chain activity across thousands of integrations.",
    };
  }
  return {
    slug: "koinly",
    why: "For your mix of activity, Koinly is the safest all-rounder — ATO myTax-ready reports, wide exchange/wallet coverage, and solid DeFi, staking and NFT support.",
  };
}

const chip =
  "inline-flex items-center gap-2 rounded-full border px-3.5 py-2 text-sm font-medium transition-colors cursor-pointer select-none";
const seg =
  "rounded-lg border px-3.5 py-2 text-sm font-medium transition-colors cursor-pointer select-none";

export function TaxFinder({
  tools,
  accountant,
  daysToDeadline,
  affiliateDisclosure,
  sourceType = "homepage",
}: TaxFinderProps) {
  const [acts, setActs] = useState<Set<ActKey>>(new Set());
  const [vol, setVol] = useState<VolKey | null>(null);
  const [pri, setPri] = useState<PriKey | null>(null);

  const bySlug = useMemo(() => {
    const m = new Map<string, TaxFinderTool>();
    for (const t of tools) m.set(t.slug, t);
    return m;
  }, [tools]);

  const events = useMemo(() => {
    const out: string[] = [];
    for (const a of acts) for (const e of EVENTS[a]) out.push(e);
    return out;
  }, [acts]);

  const started = acts.size > 0 || pri !== null;
  const rec = recommend(acts, vol, pri);
  const pick = bySlug.get(rec.slug) ?? tools[0] ?? null;
  const showAccountant = Boolean(accountant) && (vol === "high" || pri === "complex");

  function toggleAct(k: ActKey) {
    setActs((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  }

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[1.35fr_1fr]">
      {/* ── Question panel ── */}
      <div className="rounded-2xl border border-gray-200 bg-white p-5 sm:p-6">
        <fieldset className="pb-5">
          <legend className="flex items-baseline gap-2 text-[15px] font-bold text-gray-900">
            <Num n={1} /> What did you do with crypto this financial year?
          </legend>
          <p className="ms-8 mt-1 text-sm text-gray-500">
            Pick everything that applies — it changes your taxable events.
          </p>
          <div className="ms-8 mt-3.5 flex flex-wrap gap-2.5">
            {ACTS.map((a) => {
              const on = acts.has(a.k);
              return (
                <button
                  type="button"
                  key={a.k}
                  aria-pressed={on}
                  onClick={() => toggleAct(a.k)}
                  className={`${chip} ${
                    on
                      ? "border-[color:var(--color-accent,#16A34A)] bg-[color:var(--color-accent,#16A34A)]/10 text-[color:var(--color-accent-text,#15803D)]"
                      : "border-gray-200 text-gray-700 hover:border-gray-300"
                  }`}
                >
                  <span
                    aria-hidden="true"
                    className={`grid size-4 place-items-center rounded border text-[10px] text-white ${
                      on
                        ? "border-[color:var(--color-accent,#16A34A)] bg-[color:var(--color-accent,#16A34A)]"
                        : "border-gray-300"
                    }`}
                  >
                    {on ? "✓" : ""}
                  </span>
                  {a.label}
                </button>
              );
            })}
          </div>
        </fieldset>

        <fieldset className="border-t border-gray-100 py-5">
          <legend className="flex items-baseline gap-2 text-[15px] font-bold text-gray-900">
            <Num n={2} /> Roughly how many transactions?
          </legend>
          <div className="ms-8 mt-3.5 flex flex-wrap gap-2.5">
            {VOLS.map((v) => (
              <Opt key={v.k} on={vol === v.k} onClick={() => setVol(v.k)} label={v.label} />
            ))}
          </div>
        </fieldset>

        <fieldset className="border-t border-gray-100 pt-5">
          <legend className="flex items-baseline gap-2 text-[15px] font-bold text-gray-900">
            <Num n={3} /> What matters most to you?
          </legend>
          <div className="ms-8 mt-3.5 flex flex-wrap gap-2.5">
            {PRIS.map((p) => (
              <Opt key={p.k} on={pri === p.k} onClick={() => setPri(p.k)} label={p.label} />
            ))}
          </div>
        </fieldset>
      </div>

      {/* ── Result panel ── */}
      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm lg:sticky lg:top-[82px]">
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
          <span className="text-xs font-bold uppercase tracking-[0.04em] text-gray-500">
            Your result
          </span>
          <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700">
            {daysToDeadline} days to 31 Oct
          </span>
        </div>

        <div className="px-5 py-5">
          <p className="text-xs font-bold uppercase tracking-[0.04em] text-gray-500">
            Your likely ATO taxable events
          </p>
          {events.length === 0 ? (
            <p className="mt-2.5 text-sm text-gray-500">Select what you did above to see this.</p>
          ) : (
            <ul className="mt-2.5 flex flex-col gap-2">
              {events.map((e) => (
                <li key={e} className="flex items-start gap-2.5 text-sm text-gray-700">
                  <span
                    aria-hidden="true"
                    className="mt-2 size-1.5 shrink-0 rounded-full bg-[color:var(--color-accent,#16A34A)]"
                  />
                  {e}
                </li>
              ))}
            </ul>
          )}

          {started && pick && (
            <div className="mt-5 border-t border-dashed border-gray-200 pt-4">
              <p className="text-xs font-bold uppercase tracking-[0.04em] text-[color:var(--color-accent-text,#15803D)]">
                Recommended for you
              </p>
              <div className="mt-2.5">
                <p className="text-lg font-extrabold text-gray-900">{pick.name}</p>
                <p className="text-[13px] text-gray-500">{pick.tagline}</p>
              </div>
              <p className="mt-3 text-sm text-gray-700">{rec.why}</p>
              <div className="mt-4 flex flex-col gap-2">
                <ProductCardCta
                  href={pick.affiliateUrl}
                  slug={pick.slug}
                  sourceType={sourceType}
                  label={`Visit ${pick.name} →`}
                  className="block w-full rounded-lg px-4 py-2.5 text-center text-sm font-semibold text-white transition-opacity hover:opacity-90"
                  style={{ backgroundColor: "var(--color-accent, #16A34A)" }}
                />
                {showAccountant && accountant && (
                  <ProductCardCta
                    href={accountant.affiliateUrl}
                    slug={accountant.slug}
                    sourceType={sourceType}
                    label="Complex situation? Talk to a crypto accountant →"
                    className="block w-full rounded-lg border border-gray-200 px-4 py-2.5 text-center text-sm font-semibold text-gray-800 transition-colors hover:bg-gray-50"
                  />
                )}
              </div>
            </div>
          )}
        </div>

        <p className="px-5 pb-5 text-[11.5px] leading-relaxed text-gray-500">
          {affiliateDisclosure}
        </p>
      </div>
    </div>
  );
}

function Num({ n }: { n: number }) {
  return (
    <span className="grid size-[22px] shrink-0 place-items-center rounded-full bg-[color:var(--color-accent,#16A34A)]/10 text-xs font-bold text-[color:var(--color-accent-text,#15803D)]">
      {n}
    </span>
  );
}

function Opt({ on, onClick, label }: { on: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={`${seg} ${
        on
          ? "border-[color:var(--color-accent,#16A34A)] bg-[color:var(--color-accent,#16A34A)]/10 text-[color:var(--color-accent-text,#15803D)]"
          : "border-gray-200 text-gray-700 hover:border-gray-300"
      }`}
    >
      {label}
    </button>
  );
}

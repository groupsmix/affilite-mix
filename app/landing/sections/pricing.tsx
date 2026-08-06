"use client";

import { motion } from "framer-motion";

const plans = [
  {
    name: "Starter",
    price: "$49",
    period: "/mo",
    description: "For solo operators getting started",
    features: [
      "Up to 3 tenants",
      "5,000 AI-generated articles/mo",
      "50k tracked clicks/mo",
      "Community support",
      "Cloudflare Workers deploy",
    ],
    highlighted: false,
  },
  {
    name: "Operator",
    price: "$149",
    period: "/mo",
    description: "For serious portfolio builders",
    features: [
      "Up to 15 tenants",
      "25,000 AI-generated articles/mo",
      "500k tracked clicks/mo",
      "Priority support + Slack",
      "Multi-LLM fallback",
      "Custom domains",
      "Advanced analytics",
    ],
    highlighted: true,
  },
  {
    name: "Fleet",
    price: "$499",
    period: "/mo",
    description: "For teams running at scale",
    features: [
      "Unlimited tenants",
      "Unlimited articles",
      "Unlimited tracked clicks",
      "Dedicated support",
      "SSO / team management",
      "SLA guarantee (99.95%)",
      "Custom integrations",
      "Whitelabel option",
    ],
    highlighted: false,
  },
];

export function PricingSection() {
  return (
    <section id="pricing" className="relative py-24 md:py-32">
      <div className="mx-auto max-w-6xl px-6">
        <motion.h2
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.7 }}
          className="mb-4 text-center text-3xl font-semibold tracking-tight text-white md:text-5xl"
        >
          Pricing
        </motion.h2>
        <motion.p
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ delay: 0.2, duration: 0.6 }}
          className="mb-16 text-center text-base text-white/40"
        >
          Every plan includes the full platform. No feature walls.
        </motion.p>

        <div className="grid gap-6 md:grid-cols-3">
          {plans.map((plan, i) => (
            <motion.div
              key={plan.name}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.1, duration: 0.6 }}
              className={`relative rounded-xl border p-8 ${
                plan.highlighted
                  ? "border-brand bg-white/[0.03]"
                  : "border-white/[0.06] bg-white/[0.02]"
              }`}
            >
              {plan.highlighted && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-brand px-4 py-1 font-mono-accent text-[10px] font-medium text-white">
                  MOST POPULAR
                </div>
              )}

              <h3 className="font-mono-accent text-sm text-white/40">{plan.name}</h3>
              <div className="mt-3 flex items-baseline gap-1">
                <span className="text-4xl font-semibold tabular-nums text-white">{plan.price}</span>
                <span className="text-sm text-white/30">{plan.period}</span>
              </div>
              <p className="mt-2 text-sm text-white/30">{plan.description}</p>

              <ul className="mt-6 space-y-2.5">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-center gap-2 text-sm text-white/50">
                    <span className="text-white/20">—</span>
                    {f}
                  </li>
                ))}
              </ul>

              <button
                className={`mt-8 w-full rounded-lg py-3 text-sm font-medium transition-transform hover:scale-[1.02] ${
                  plan.highlighted
                    ? "cta-glow bg-brand text-white"
                    : "border border-white/[0.1] bg-white/[0.03] text-white/60 hover:text-white"
                }`}
              >
                Get started
              </button>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

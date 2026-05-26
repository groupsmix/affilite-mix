"use client";

import { motion } from "framer-motion";
import { KpiCounter } from "../components/kpi-counter";

const stats = [
  {
    value: 0.0007,
    prefix: "$",
    decimals: 4,
    label: "cost per click",
    sub: "Cloudflare Workers + KV. No origin hit.",
  },
  {
    value: 5,
    prefix: "<",
    suffix: "ms",
    decimals: 0,
    label: "quota reservation",
    sub: "Atomic, per-tenant, edge-local.",
  },
  {
    value: 120,
    prefix: "<",
    suffix: "ms",
    decimals: 0,
    label: "p95 page render at edge",
    sub: "ISR + Cloudflare CDN. No cold starts.",
  },
];

export function EconomicsSection() {
  return (
    <section className="relative py-24 md:py-32">
      <div className="mx-auto max-w-6xl px-6">
        <motion.h2
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.7 }}
          className="mb-16 text-3xl font-semibold tracking-tight text-white md:text-5xl"
        >
          Operator economics.
        </motion.h2>

        <div className="grid gap-12 md:grid-cols-3">
          {stats.map((stat, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.1, duration: 0.6 }}
              className="text-center md:text-left"
            >
              <div className="text-5xl font-semibold text-white md:text-6xl">
                <KpiCounter
                  end={stat.value}
                  prefix={stat.prefix}
                  suffix={stat.suffix}
                  decimals={stat.decimals}
                />
              </div>
              <div className="font-mono-accent mt-3 text-sm text-white/40">{stat.label}</div>
              <p className="mt-1 text-sm text-white/25">{stat.sub}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

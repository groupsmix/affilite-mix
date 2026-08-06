"use client";

import { motion } from "framer-motion";
import { Globe } from "../components/globe";
import { KpiCounter } from "../components/kpi-counter";

const kpis = [
  { label: "clicks last 60s", end: 4812, prefix: "", suffix: "" },
  { label: "tenants live", end: 14, prefix: "", suffix: "" },
  { label: "cost/click", end: 0.0007, prefix: "$", suffix: "", decimals: 4 },
  { label: "p95", end: 38, prefix: "", suffix: "ms" },
];

export function HeroSection() {
  return (
    <section className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden px-6">
      {/* Aurora gradient background */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 80% 60% at 50% 20%, rgba(124,58,237,0.08) 0%, transparent 60%), radial-gradient(ellipse 60% 40% at 30% 80%, rgba(232,122,47,0.04) 0%, transparent 50%)",
        }}
      />

      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1] }}
        className="relative z-10"
      >
        <Globe />
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4, duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
        className="relative z-10 -mt-8 text-center"
      >
        <h1 className="text-4xl font-semibold tracking-tight text-white md:text-6xl lg:text-7xl">
          One codebase. Every niche.
          <br />
          <span className="bg-gradient-to-r from-white/80 to-white/50 bg-clip-text text-transparent">
            The edge does the rest.
          </span>
        </h1>
      </motion.div>

      {/* KPI strip */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.8, duration: 0.7 }}
        className="glass-panel relative z-10 mt-10 flex flex-wrap items-center justify-center gap-6 rounded-xl px-8 py-4 md:gap-10"
      >
        {kpis.map((kpi, i) => (
          <div key={i} className="flex items-baseline gap-2">
            <span className="text-xl font-semibold text-white md:text-2xl">
              <KpiCounter
                end={kpi.end}
                prefix={kpi.prefix}
                suffix={kpi.suffix}
                decimals={kpi.decimals}
              />
            </span>
            <span className="font-mono-accent text-xs text-white/40">{kpi.label}</span>
          </div>
        ))}
      </motion.div>

      {/* CTAs */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.2, duration: 0.6 }}
        className="relative z-10 mt-10 flex flex-col items-center gap-4 sm:flex-row"
      >
        <a
          href="#ship-command"
          className="cta-glow interactive-cursor inline-block rounded-lg bg-brand px-8 py-3.5 text-sm font-medium text-white transition-transform hover:scale-[1.03]"
        >
          Spin up a tenant →
        </a>
      </motion.div>
    </section>
  );
}

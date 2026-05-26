"use client";

import { motion } from "framer-motion";

const logos = [
  { name: "Cloudflare Workers", icon: "⬡" },
  { name: "Supabase", icon: "⚡" },
  { name: "Sentry", icon: "◉" },
  { name: "Stripe", icon: "▶" },
  { name: "Turnstile", icon: "🛡" },
];

export function TrustSection() {
  return (
    <section className="relative py-24 md:py-32">
      <div className="mx-auto max-w-6xl px-6">
        <motion.h2
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.7 }}
          className="mb-12 text-3xl font-semibold tracking-tight text-white md:text-5xl"
        >
          Built like infrastructure.
        </motion.h2>

        <div className="mb-8 flex flex-wrap items-center justify-center gap-10 md:justify-start">
          {logos.map((logo, i) => (
            <motion.div
              key={logo.name}
              initial={{ opacity: 0, y: 10 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.08, duration: 0.4 }}
              className="flex flex-col items-center gap-2"
            >
              <span className="text-2xl grayscale opacity-40">{logo.icon}</span>
              <span className="font-mono-accent text-[10px] text-white/25">{logo.name}</span>
            </motion.div>
          ))}
        </div>

        <motion.p
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ delay: 0.3, duration: 0.6 }}
          className="max-w-2xl text-sm italic text-white/25"
        >
          Drift detection, mutation testing, RLS invariants, edge-shipped logs. Treat your portfolio
          like production.
        </motion.p>
      </div>
    </section>
  );
}

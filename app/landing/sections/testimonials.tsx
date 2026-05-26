"use client";

import { motion } from "framer-motion";

const quotes = [
  {
    text: "Replaced 6 WordPress installs, 3 VPSes, and a spreadsheet that was holding my sanity together. Affilite-Mix just runs.",
    role: "Solo operator",
    portfolio: "11 sites",
    arr: "6 figures ARR",
  },
  {
    text: "The RLS isolation is real. Gave a VA access to one tenant and literally could not leak data to another. That never happened with my old stack.",
    role: "Performance marketer",
    portfolio: "7 sites",
    arr: "Mid 5 figures ARR",
  },
  {
    text: "Spun up a new niche site at 2am. Content pipeline had 12 articles queued by morning. Deployed, indexed, earning by Thursday.",
    role: "Indie SEO",
    portfolio: "4 sites",
    arr: "Early stage",
  },
];

export function TestimonialsSection() {
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
          For the operators who treat <br className="hidden md:inline" />
          sites like a portfolio.
        </motion.h2>

        <div className="grid gap-6 md:grid-cols-3">
          {quotes.map((q, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.1, duration: 0.6 }}
              className="glass-panel rounded-xl p-6"
            >
              <p className="mb-6 text-sm leading-relaxed text-white/50">&ldquo;{q.text}&rdquo;</p>
              <div className="font-mono-accent text-[11px] text-white/30">
                — {q.role} · {q.portfolio} · {q.arr}
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

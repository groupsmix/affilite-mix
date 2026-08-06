"use client";

import { motion } from "framer-motion";

export function FinalCtaSection() {
  return (
    <section className="relative flex min-h-[60vh] flex-col items-center justify-center overflow-hidden px-6 py-24">
      {/* Subtle aurora */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 60% 50% at 50% 60%, rgba(124,58,237,0.06) 0%, transparent 60%)",
        }}
      />

      {/* Pulsing dot — represents a single edge node */}
      <motion.div
        animate={{ scale: [1, 1.3, 1], opacity: [0.4, 0.7, 0.4] }}
        transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
        className="mb-10 h-20 w-20 rounded-full bg-brand-light/10"
        style={{
          boxShadow: "0 0 60px rgba(232,122,47,0.15), inset 0 0 30px rgba(232,122,47,0.1)",
        }}
      />

      <motion.h2
        initial={{ opacity: 0, y: 30 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.7 }}
        className="mb-8 text-center text-3xl font-semibold tracking-tight text-white md:text-5xl"
      >
        Your fleet is one command away.
      </motion.h2>

      <motion.div
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true }}
        transition={{ delay: 0.3, duration: 0.6 }}
      >
        <a
          href="#ship-command"
          className="cta-glow interactive-cursor inline-block rounded-lg bg-brand px-10 py-4 text-sm font-medium text-white transition-transform hover:scale-[1.03]"
        >
          Spin up a tenant →
        </a>
      </motion.div>
    </section>
  );
}

"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

const faqs = [
  {
    q: "Do I need to know how to code?",
    a: "You need to be comfortable with a terminal. The platform handles infra, but you configure niches, review AI content, and manage your domains. It's an operator tool, not a drag-and-drop builder.",
  },
  {
    q: "How does multi-LLM fallback work?",
    a: "Each content generation request tries your preferred provider first. If it fails or times out, the system falls back through a configurable chain (e.g., Cloudflare AI → Gemini → Groq). You set the order, budget caps, and quality thresholds.",
  },
  {
    q: "Is click tracking really privacy-preserving?",
    a: "Yes. We use 24-hour rotating dedup hashes. No raw IPs stored, no browser fingerprinting, no PII in the click log. The hash expires and cannot be reversed.",
  },
  {
    q: "Can I bring my own domain?",
    a: "Every tenant gets a custom domain. Point your DNS, we handle the rest — SSL, edge routing, CDN. Takes about 90 seconds.",
  },
  {
    q: "What happens if Supabase goes down?",
    a: "Edge-cached content stays live. Click tracking falls back to a local queue that replays when the DB recovers. You lose real-time analytics until recovery, but you don't lose clicks or revenue.",
  },
  {
    q: "Can I export my data?",
    a: "All of it. Articles, click logs, analytics, tenant config. JSON or CSV. Your data, your export. No lock-in.",
  },
];

export function FaqSection() {
  const [open, setOpen] = useState<number | null>(null);

  return (
    <section className="relative py-24 md:py-32">
      <div className="mx-auto max-w-3xl px-6">
        <motion.h2
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.7 }}
          className="mb-12 text-3xl font-semibold tracking-tight text-white md:text-5xl"
        >
          FAQ
        </motion.h2>

        <div className="space-y-0">
          {faqs.map((faq, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 10 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.05, duration: 0.4 }}
              className="border-b border-white/[0.06]"
            >
              <button
                onClick={() => setOpen(open === i ? null : i)}
                className="interactive-cursor flex w-full items-center justify-between py-5 text-left"
              >
                <span className="flex items-center gap-3">
                  <span className="font-mono-accent text-sm text-white/20">?</span>
                  <span className="text-sm font-medium text-white/70">{faq.q}</span>
                </span>
                <span
                  className={`text-white/20 transition-transform ${open === i ? "rotate-45" : ""}`}
                >
                  +
                </span>
              </button>
              <AnimatePresence>
                {open === i && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.3 }}
                    className="overflow-hidden"
                  >
                    <p className="pb-5 pl-8 text-sm leading-relaxed text-white/40">{faq.a}</p>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

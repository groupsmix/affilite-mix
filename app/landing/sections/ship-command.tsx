"use client";

import { useEffect, useRef, useState } from "react";
import { motion, useInView } from "framer-motion";

const lines = [
  {
    text: '$ npm run add-site -- --niche="mechanical-keyboards" --lang=en --domain=keyclicks.io',
    type: "cmd" as const,
  },
  { text: "✔ tenant provisioned", type: "ok" as const },
  { text: "✔ RLS policies attached", type: "ok" as const },
  { text: "✔ edge routing live", type: "ok" as const },
  { text: "✔ first article scheduled in 14:00", type: "ok" as const },
];

export function ShipCommandSection() {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-100px" });
  const [visibleLines, setVisibleLines] = useState(0);
  const [cmdChars, setCmdChars] = useState(0);
  const prefersReducedMotion =
    typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  useEffect(() => {
    if (!isInView) return;
    if (prefersReducedMotion) {
      setCmdChars(lines[0]!.text.length);
      setVisibleLines(lines.length);
      return;
    }

    // Type the command
    let idx = 0;
    const typeInterval = setInterval(() => {
      idx++;
      setCmdChars(idx);
      if (idx >= lines[0]!.text.length) {
        clearInterval(typeInterval);
        // Stream result lines
        lines.slice(1).forEach((_, i) => {
          setTimeout(() => setVisibleLines(i + 2), 600 + i * 500);
        });
      }
    }, 22);

    return () => clearInterval(typeInterval);
  }, [isInView, prefersReducedMotion]);

  return (
    <section id="ship-command" ref={ref} className="relative py-24 md:py-32">
      <div className="mx-auto max-w-6xl px-6">
        <motion.h2
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.7 }}
          className="mb-4 text-3xl font-semibold tracking-tight text-white md:text-5xl"
        >
          Ship a new site in one command.
        </motion.h2>
        <motion.p
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ delay: 0.2, duration: 0.6 }}
          className="mb-12 max-w-xl text-base text-white/40"
        >
          Tenant, RLS, routing, content pipeline. One command. Done.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 0.3, duration: 0.6 }}
          className="mx-auto max-w-2xl overflow-hidden rounded-xl border border-white/[0.06] bg-[#0d0e12]"
        >
          {/* Terminal header */}
          <div className="flex items-center gap-2 border-b border-white/[0.06] px-4 py-3">
            <div className="h-2.5 w-2.5 rounded-full bg-white/10" />
            <div className="h-2.5 w-2.5 rounded-full bg-white/10" />
            <div className="h-2.5 w-2.5 rounded-full bg-white/10" />
            <span className="ml-3 font-mono-accent text-[10px] text-white/20">~/affilite-mix</span>
          </div>

          {/* Terminal body */}
          <div className="p-5 font-mono-accent text-sm leading-relaxed">
            {/* Command line */}
            <div className="text-white/60">
              {lines[0]!.text.slice(0, cmdChars)}
              {cmdChars < lines[0]!.text.length && (
                <span className="caret-blink ml-0.5 inline-block h-4 w-[7px] bg-tungsten align-text-bottom" />
              )}
            </div>

            {/* Result lines */}
            {lines.slice(1, visibleLines).map((line, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, x: -5 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.2 }}
                className="mt-1 text-isotope/80"
              >
                {line.text}
              </motion.div>
            ))}

            {/* Blinking cursor at end */}
            {visibleLines >= lines.length && (
              <div className="mt-2 text-white/40">
                $
                <span className="caret-blink ml-1 inline-block h-4 w-[7px] bg-tungsten align-text-bottom" />
              </div>
            )}
          </div>
        </motion.div>
      </div>
    </section>
  );
}

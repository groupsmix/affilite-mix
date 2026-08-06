"use client";

import { useEffect, useRef, useState } from "react";
import { motion, useInView } from "framer-motion";

const promptText =
  'Generate a comprehensive affiliate review article about the "best hardware wallets for 2026" targeting crypto enthusiasts. Include pros/cons, pricing comparison, and affiliate CTAs.';

const providers = ["Cloudflare AI", "Google Gemini", "Groq"];

const articleBlocks = [
  "# Best Hardware Wallets for 2026",
  "",
  "Keeping your crypto safe shouldn't mean sacrificing usability. We tested 8 hardware wallets across security, UX, and price.",
  "",
  "## 1. Ledger Nano X Pro",
  "**Price:** $149 · **Rating:** ★★★★½",
  "Bluetooth 5.3, CC EAL6+ secure element, supports 5,500+ tokens.",
  "",
  "## 2. Trezor Safe 5",
  "**Price:** $169 · **Rating:** ★★★★★",
  "Open-source firmware, color touchscreen, Shamir backup.",
];

export function ContentPipelineSection() {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-100px" });
  const [typedChars, setTypedChars] = useState(0);
  const [visibleBlocks, setVisibleBlocks] = useState(0);
  const [activeProvider, setActiveProvider] = useState(0);
  const [moderationPassed, setModerationPassed] = useState(false);
  const prefersReducedMotion =
    typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  useEffect(() => {
    if (!isInView) return;
    if (prefersReducedMotion) {
      setTypedChars(promptText.length);
      setVisibleBlocks(articleBlocks.length);
      setModerationPassed(true);
      return;
    }

    // Type the prompt
    let charIdx = 0;
    const typeInterval = setInterval(() => {
      charIdx++;
      setTypedChars(charIdx);
      if (charIdx >= promptText.length) clearInterval(typeInterval);
    }, 18);

    // Show article blocks with delay
    const blockTimers: NodeJS.Timeout[] = [];
    articleBlocks.forEach((_, i) => {
      blockTimers.push(setTimeout(() => setVisibleBlocks(i + 1), 2000 + i * 300));
    });

    // Cycle providers
    const providerTimer = setInterval(() => {
      setActiveProvider((p) => (p + 1) % providers.length);
    }, 1200);

    // Moderation pass
    const modTimer = setTimeout(
      () => setModerationPassed(true),
      2000 + articleBlocks.length * 300 + 500,
    );

    return () => {
      clearInterval(typeInterval);
      blockTimers.forEach(clearTimeout);
      clearInterval(providerTimer);
      clearTimeout(modTimer);
    };
  }, [isInView, prefersReducedMotion]);

  return (
    <section ref={ref} className="relative py-24 md:py-32">
      <div className="mx-auto max-w-6xl px-6">
        <motion.h2
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.7 }}
          className="mb-4 text-3xl font-semibold tracking-tight text-white md:text-5xl"
        >
          Content writes itself. <span className="text-white/40">At the edge.</span>
        </motion.h2>
        <motion.p
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ delay: 0.2, duration: 0.6 }}
          className="mb-12 max-w-xl text-base text-white/40"
        >
          Multi-LLM fallback. Moderation gate. Human approval. The pipeline runs; you review.
        </motion.p>

        <div className="grid gap-6 lg:grid-cols-2">
          {/* Prompt side */}
          <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-6">
            <div className="mb-3 flex items-center gap-2">
              <div className="h-2 w-2 rounded-full bg-brand-light" />
              <span className="font-mono-accent text-xs text-white/30">Prompt</span>
            </div>
            <p className="min-h-[120px] text-sm leading-relaxed text-white/60">
              {promptText.slice(0, typedChars)}
              {typedChars < promptText.length && (
                <span className="caret-blink inline-block w-[2px] h-4 bg-brand-light ml-0.5 align-text-bottom" />
              )}
            </p>
          </div>

          {/* Article output side */}
          <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-6">
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="h-2 w-2 rounded-full bg-signal" />
                <span className="font-mono-accent text-xs text-white/30">Output</span>
              </div>
              {/* Provider fallback indicator */}
              <div className="font-mono-accent flex items-center gap-1.5 text-[10px]">
                {providers.map((p, i) => (
                  <span
                    key={p}
                    className={`transition-colors ${
                      i === activeProvider ? "text-brand-light" : "text-white/20"
                    }`}
                  >
                    {p}
                    {i < providers.length - 1 && <span className="mx-1 text-white/10">→</span>}
                  </span>
                ))}
              </div>
            </div>
            <div className="min-h-[200px] space-y-1 text-sm leading-relaxed text-white/50">
              {articleBlocks.slice(0, visibleBlocks).map((line, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, x: 10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.3 }}
                >
                  {line.startsWith("#") ? (
                    <p className="font-semibold text-white/80">{line.replace(/^#+\s/, "")}</p>
                  ) : line.startsWith("**") ? (
                    <p className="font-mono-accent text-xs text-white/40">{line}</p>
                  ) : (
                    <p>{line || <br />}</p>
                  )}
                </motion.div>
              ))}
            </div>

            {/* Moderation gate */}
            {moderationPassed && (
              <motion.div
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                className="mt-4 flex items-center gap-2 rounded-lg bg-signal/10 px-3 py-2"
              >
                <span className="inline-block h-4 w-4 rounded-full bg-signal/80 text-center text-[10px] font-bold leading-4 text-black">
                  ✓
                </span>
                <span className="font-mono-accent text-xs text-signal/80">
                  Moderation passed · Ready for review
                </span>
              </motion.div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

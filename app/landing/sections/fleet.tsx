"use client";

import { useRef } from "react";
import { motion, useInView } from "framer-motion";

const sites = [
  {
    name: "Arabic Tools",
    domain: "arabic-tools.net",
    lang: "ar",
    dir: "rtl",
    mau: "28.1k",
    mrr: "$6.4k",
    color: "from-white/[0.06] to-white/[0.02]",
  },
  {
    name: "Crypto Tools",
    domain: "crypto-tools.io",
    lang: "en",
    dir: "ltr",
    mau: "42.3k",
    mrr: "$11.2k",
    color: "from-white/[0.06] to-white/[0.02]",
  },
  {
    name: "AI Compared",
    domain: "aicompared.co",
    lang: "en",
    dir: "ltr",
    mau: "19.7k",
    mrr: "$4.8k",
    color: "from-white/[0.06] to-white/[0.02]",
  },
  {
    name: "Watch Tools",
    domain: "watchtools.com",
    lang: "en",
    dir: "ltr",
    mau: "12.4k",
    mrr: "$4.2k",
    color: "from-white/[0.06] to-white/[0.02]",
  },
  {
    name: "Wrist Nerd",
    domain: "wristnerd.xyz",
    lang: "en",
    dir: "ltr",
    mau: "8.9k",
    mrr: "$2.1k",
    color: "from-white/[0.06] to-white/[0.02]",
  },
  {
    name: "Compare AI",
    domain: "compareai.site",
    lang: "en",
    dir: "ltr",
    mau: "15.2k",
    mrr: "$3.7k",
    color: "from-white/[0.06] to-white/[0.02]",
  },
  {
    name: "Keyboard Hub",
    domain: "keyclicks.io",
    lang: "en",
    dir: "ltr",
    mau: "6.3k",
    mrr: "$1.9k",
    color: "from-white/[0.06] to-white/[0.02]",
  },
  {
    name: "Gadget Pick",
    domain: "gadgetpick.co",
    lang: "en",
    dir: "ltr",
    mau: "11.8k",
    mrr: "$3.1k",
    color: "from-white/[0.06] to-white/[0.02]",
  },
];

export function FleetSection() {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-100px" });

  return (
    <section className="relative overflow-hidden py-24 md:py-32" ref={ref}>
      <div className="mx-auto max-w-6xl px-6">
        <motion.h2
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.7 }}
          className="mb-4 text-3xl font-semibold tracking-tight text-white md:text-5xl"
        >
          The fleet, not the site.
        </motion.h2>
        <motion.p
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ delay: 0.2, duration: 0.6 }}
          className="mb-12 max-w-xl text-base text-white/40"
        >
          Every domain runs the same stack. Different niche, different theme, different language.
          One deploy.
        </motion.p>
      </div>

      {/* Horizontal scrolling strip */}
      <div className="no-scrollbar flex gap-5 overflow-x-auto px-6 pb-4 md:px-[calc(50vw-560px)]">
        {sites.map((site, i) => (
          <motion.div
            key={site.domain}
            initial={{ opacity: 0, x: 40 }}
            animate={isInView ? { opacity: 1, x: 0 } : {}}
            transition={{ delay: i * 0.08, duration: 0.5 }}
            className="group relative flex w-72 flex-none flex-col rounded-xl border border-white/[0.06] bg-white/[0.02] p-5 transition-transform hover:scale-[1.04]"
          >
            {/* Gradient border effect */}
            <div
              className={`pointer-events-none absolute inset-0 rounded-xl bg-gradient-to-br ${site.color} opacity-0 transition-opacity group-hover:opacity-100`}
            />
            <div className="relative z-10">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-lg font-medium text-white">{site.name}</h3>
                <span
                  className="font-mono-accent text-[10px] uppercase tracking-widest text-white/30"
                  dir={site.dir}
                >
                  {site.lang}
                </span>
              </div>

              {/* Mini preview placeholder */}
              <div
                className="mb-4 flex h-32 items-center justify-center rounded-lg bg-white/[0.03]"
                dir={site.dir}
              >
                <div className="space-y-2 px-4" dir={site.dir}>
                  <div className="h-2 w-24 rounded bg-white/10" />
                  <div className="h-2 w-32 rounded bg-white/[0.06]" />
                  <div className="h-2 w-20 rounded bg-white/[0.04]" />
                  <div className="mt-3 h-6 w-16 rounded bg-white/[0.08]" />
                </div>
              </div>

              {/* Stats — visible on hover */}
              <div className="font-mono-accent flex items-center gap-3 text-[11px] text-white/30 opacity-0 transition-opacity group-hover:opacity-100">
                <span>{site.domain}</span>
                <span className="text-white/15">·</span>
                <span>{site.mau} MAU</span>
                <span className="text-white/15">·</span>
                <span className="text-signal">{site.mrr} MRR</span>
              </div>
            </div>
          </motion.div>
        ))}
      </div>
    </section>
  );
}

"use client";

import { useState, useEffect } from "react";
import { motion, useInView } from "framer-motion";
import { useRef } from "react";

const tenants = [
  { name: "arabic-tools", color: "border-white/10", users: "2,841" },
  { name: "crypto-tools", color: "border-white/10", users: "5,124" },
  { name: "watch-tools", color: "border-white/10", users: "1,298" },
];

export function MultiTenantSection() {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-100px" });
  const [showBlock, setShowBlock] = useState(false);

  useEffect(() => {
    if (!isInView) return;
    const timer = setTimeout(() => setShowBlock(true), 1500);
    return () => clearTimeout(timer);
  }, [isInView]);

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
          Multi-tenant by design.
        </motion.h2>
        <motion.p
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ delay: 0.2, duration: 0.6 }}
          className="mb-16 max-w-xl text-base text-white/40"
        >
          Row-Level Security isolates every tenant at the database layer. Not application logic. Not
          middleware. The database itself.
        </motion.p>

        {/* Stacked tenant cards with 3D rotation */}
        <div className="relative mx-auto flex max-w-lg flex-col items-center gap-0">
          {tenants.map((tenant, i) => (
            <motion.div
              key={tenant.name}
              initial={{ opacity: 0, y: 30, rotateX: 0 }}
              whileInView={{ opacity: 1, y: 0, rotateX: -5 + i * 5 }}
              viewport={{ once: true }}
              transition={{ delay: 0.2 + i * 0.15, duration: 0.6 }}
              className={`relative w-full rounded-xl border ${tenant.color} bg-white/[0.03] p-6 backdrop-blur-sm`}
              style={{
                transform: `perspective(800px) rotateX(${-3 + i * 3}deg)`,
                zIndex: 3 - i,
                marginTop: i > 0 ? "-12px" : "0",
              }}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="h-3 w-3 rounded-full bg-white/10" />
                  <span className="font-mono-accent text-sm text-white/60">{tenant.name}</span>
                </div>
                <span className="font-mono-accent text-xs text-white/30">{tenant.users} rows</span>
              </div>
              <div className="mt-3 flex gap-2">
                {["content", "products", "clicks", "users"].map((t) => (
                  <span
                    key={t}
                    className="rounded bg-white/[0.04] px-2 py-0.5 font-mono-accent text-[10px] text-white/25"
                  >
                    {t}
                  </span>
                ))}
              </div>
            </motion.div>
          ))}

          {/* RLS blocked animation */}
          {showBlock && (
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              className="absolute -right-4 top-1/2 z-10 -translate-y-1/2 md:-right-12"
            >
              <div className="flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2">
                <motion.div
                  initial={{ scale: 1 }}
                  animate={{ scale: [1, 1.3, 1] }}
                  transition={{ duration: 0.4 }}
                  className="h-2 w-2 rounded-full bg-red-400"
                />
                <span className="font-mono-accent text-xs text-red-400">RLS: BLOCKED</span>
              </div>
              {/* Animated line trying to cross */}
              <svg
                className="absolute -left-16 top-1/2 -translate-y-1/2"
                width="60"
                height="2"
                viewBox="0 0 60 2"
              >
                <motion.line
                  x1="0"
                  y1="1"
                  x2="60"
                  y2="1"
                  stroke="rgba(239,68,68,0.4)"
                  strokeWidth="1.5"
                  strokeDasharray="4 3"
                  initial={{ pathLength: 0 }}
                  animate={{ pathLength: 1 }}
                  transition={{ duration: 0.6 }}
                />
              </svg>
            </motion.div>
          )}
        </div>
      </div>
    </section>
  );
}

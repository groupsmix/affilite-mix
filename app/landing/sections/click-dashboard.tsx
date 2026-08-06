"use client";

import { useEffect, useRef, useState } from "react";
import { motion, useInView } from "framer-motion";

interface ClickLog {
  id: string;
  time: string;
  site: string;
  path: string;
  edge: string;
  latency: string;
  hash: string;
}

const edges = ["DFW", "AMS", "NRT", "SIN", "LHR", "CDG", "SYD", "IAD"];
const sites = ["arabic-tools", "crypto-tools", "watchtools", "aicompared", "wristnerd"];
const paths = [
  "/best-vpn",
  "/ledger-review",
  "/seiko-presage",
  "/gpt-vs-claude",
  "/omega-seamaster",
];

function randomClick(): ClickLog {
  const edge = edges[Math.floor(Math.random() * edges.length)];
  const site = sites[Math.floor(Math.random() * sites.length)];
  const path = paths[Math.floor(Math.random() * paths.length)];
  const latency = `${Math.floor(20 + Math.random() * 40)}ms`;
  const hash = Math.random().toString(36).slice(2, 8);
  const now = new Date();
  const time = `${now.getHours().toString().padStart(2, "0")}:${now.getMinutes().toString().padStart(2, "0")}:${now.getSeconds().toString().padStart(2, "0")}`;
  return {
    id: hash,
    time,
    site: site!,
    path: path!,
    edge: edge!,
    latency,
    hash: `sha256:${Math.random().toString(36).slice(2, 10)}`,
  };
}

export function ClickDashboardSection() {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-100px" });
  const [logs, setLogs] = useState<ClickLog[]>([]);
  const [epc, setEpc] = useState(0.42);

  useEffect(() => {
    if (!isInView) return;
    // Seed initial logs
    setLogs(Array.from({ length: 8 }, randomClick));

    const interval = setInterval(() => {
      setLogs((prev) => [randomClick(), ...prev.slice(0, 11)]);
      setEpc((prev) => +(prev + (Math.random() - 0.48) * 0.02).toFixed(3));
    }, 1200);

    return () => clearInterval(interval);
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
          Every click, accounted for.
        </motion.h2>
        <motion.p
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ delay: 0.2, duration: 0.6 }}
          className="mb-12 max-w-xl text-base text-white/40"
        >
          Privacy-preserving fingerprints. 24-hour dedup hashes. No PII stored. Every redirect
          logged, every cent attributed.
        </motion.p>

        <div className="grid gap-6 lg:grid-cols-3">
          {/* Click log stream */}
          <div className="lg:col-span-2 rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 overflow-hidden">
            <div className="mb-3 flex items-center gap-2">
              <div className="h-2 w-2 animate-pulse rounded-full bg-signal" />
              <span className="font-mono-accent text-xs text-white/30">Live click stream</span>
            </div>
            <div className="space-y-0.5 font-mono-accent text-[11px]">
              {logs.map((log, i) => (
                <motion.div
                  key={`${log.id}-${i}`}
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.2 }}
                  className="flex items-center gap-3 rounded px-2 py-1 text-white/40 hover:bg-white/[0.03]"
                >
                  <span className="text-white/20">{log.time}</span>
                  <span className="text-brand-light">[{log.site}]</span>
                  <span className="text-white/50">{log.path}</span>
                  <span className="text-white/20">→</span>
                  <span className="text-white/30">{log.edge}</span>
                  <span className="text-signal">{log.latency}</span>
                  <span
                    className="ml-auto hidden text-white/15 sm:inline"
                    title="24-hour dedup hash. No PII stored."
                  >
                    {log.hash}
                  </span>
                </motion.div>
              ))}
            </div>
          </div>

          {/* EPC + Edge map mini */}
          <div className="space-y-4">
            <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-5">
              <span className="font-mono-accent text-xs text-white/30">EPC (24h)</span>
              <div className="mt-2 text-4xl font-semibold tabular-nums text-signal">
                ${epc.toFixed(3)}
              </div>
              <div className="mt-3 flex h-16 items-end gap-[3px]">
                {Array.from({ length: 24 }, (_, i) => {
                  const h = 20 + Math.random() * 80;
                  return (
                    <div
                      key={i}
                      className="flex-1 rounded-t bg-signal/20"
                      style={{ height: `${h}%` }}
                    />
                  );
                })}
              </div>
            </div>

            <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-5">
              <span className="font-mono-accent text-xs text-white/30">Edge nodes active</span>
              <div className="mt-3 flex flex-wrap gap-2">
                {edges.map((e) => (
                  <span
                    key={e}
                    className="rounded bg-white/[0.05] px-2 py-1 font-mono-accent text-[10px] text-white/40"
                  >
                    {e}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";

const eventTemplates = [
  { site: "arabic-tools", msg: "click_id={id} → amazon.ae · {ms}ms" },
  { site: "crypto-tools", msg: 'article published · "best hardware wallet 2026"' },
  { site: "watch-tools", msg: "EPC ↑ {pct}%" },
  { site: "aicompared", msg: "click_id={id} → openai.com · {ms}ms" },
  { site: "wristnerd", msg: 'article published · "omega speedmaster vs seamaster"' },
  { site: "crypto-tools", msg: "click_id={id} → ledger.com · {ms}ms" },
  { site: "arabic-tools", msg: 'article published · "أفضل VPN عربي 2026"' },
  { site: "watch-tools", msg: "click_id={id} → chrono24.com · {ms}ms" },
  { site: "aicompared", msg: "EPC ↑ {pct}%" },
  { site: "wristnerd", msg: "click_id={id} → amazon.com · {ms}ms" },
];

function randomId(): string {
  return Math.random().toString(36).slice(2, 6);
}

function generateEvent(): string {
  const tpl = eventTemplates[Math.floor(Math.random() * eventTemplates.length)];
  const msg = tpl!.msg
    .replace("{id}", randomId())
    .replace("{ms}", String(20 + Math.floor(Math.random() * 50)))
    .replace("{pct}", (1 + Math.random() * 8).toFixed(1));
  return `[${tpl!.site}] ${msg}`;
}

export function TenantTerminal() {
  const [visible, setVisible] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  const [showHint, setShowHint] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const prefersReducedMotion =
    typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // Show after scrolling past hero
  useEffect(() => {
    const handler = () => {
      if (window.scrollY > window.innerHeight * 0.8) {
        setVisible(true);
      }
    };
    window.addEventListener("scroll", handler, { passive: true });
    return () => window.removeEventListener("scroll", handler);
  }, []);

  // Show keyboard hint after 8s idle
  useEffect(() => {
    if (!visible || collapsed) return;
    const timer = setTimeout(() => setShowHint(true), 8000);
    return () => clearTimeout(timer);
  }, [visible, collapsed]);

  // Stream events
  useEffect(() => {
    if (!visible || collapsed || prefersReducedMotion) return;
    const interval = setInterval(() => {
      setLogs((prev) => [...prev.slice(-20), generateEvent()]);
    }, 1500);
    return () => clearInterval(interval);
  }, [visible, collapsed, prefersReducedMotion]);

  // Auto-scroll
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs]);

  // Keyboard shortcut
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === ".") {
      e.preventDefault();
      setVisible(true);
      setCollapsed(false);
    }
  }, []);

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  if (!visible) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 20, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 20, scale: 0.95 }}
        transition={{ duration: 0.3 }}
        className="fixed bottom-4 right-4 z-50"
        style={{ width: collapsed ? "auto" : "320px" }}
      >
        {collapsed ? (
          <button
            onClick={() => setCollapsed(false)}
            className="glass-panel interactive-cursor rounded-lg px-3 py-2 font-mono-accent text-[10px] text-white/30 transition-colors hover:text-white/50"
          >
            ▸ tenant log
          </button>
        ) : (
          <div className="glass-panel overflow-hidden rounded-xl">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-white/[0.06] px-3 py-2">
              <div className="flex items-center gap-2">
                <div className="h-1.5 w-1.5 animate-pulse rounded-full bg-signal" />
                <span className="font-mono-accent text-[10px] text-white/25">tenant log</span>
              </div>
              <div className="flex gap-1">
                <button
                  onClick={() => setCollapsed(true)}
                  className="rounded px-1.5 py-0.5 text-[10px] text-white/20 hover:bg-white/[0.05] hover:text-white/40"
                >
                  _
                </button>
                <button
                  onClick={() => setVisible(false)}
                  className="rounded px-1.5 py-0.5 text-[10px] text-white/20 hover:bg-white/[0.05] hover:text-white/40"
                >
                  ×
                </button>
              </div>
            </div>

            {/* Log stream */}
            <div
              ref={scrollRef}
              className="h-32 overflow-y-auto px-3 py-2 font-mono-accent text-[10px] leading-relaxed"
            >
              {logs.length === 0 && !prefersReducedMotion ? (
                <span className="text-white/15">Connecting…</span>
              ) : (
                logs.map((log, i) => (
                  <div key={i} className="text-white/30">
                    {log}
                  </div>
                ))
              )}
              {prefersReducedMotion && logs.length === 0 && (
                <div className="text-white/20">
                  {Array.from({ length: 5 }, () => generateEvent()).map((e, i) => (
                    <div key={i}>{e}</div>
                  ))}
                </div>
              )}
            </div>

            {/* Keyboard hint */}
            <AnimatePresence>
              {showHint && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="border-t border-white/[0.04] px-3 py-1.5 text-center font-mono-accent text-[9px] text-white/15"
                >
                  ⌘ + . to toggle
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}
      </motion.div>
    </AnimatePresence>
  );
}

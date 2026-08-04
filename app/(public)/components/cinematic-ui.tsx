"use client";

import { useEffect, useRef, useState } from "react";

/* ------------------------------------------------------------------ */
/*  Shared: respects prefers-reduced-motion                            */
/* ------------------------------------------------------------------ */

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const handler = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);
  return reduced;
}

/** Fires `onEnter` once when the element first scrolls into view. */
function useInView<T extends HTMLElement>(onEnter: () => void, rootMargin = "0px") {
  const ref = useRef<T>(null);
  const fired = useRef(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting && !fired.current) {
            fired.current = true;
            onEnter();
          }
        }
      },
      { rootMargin, threshold: 0.2 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [onEnter, rootMargin]);
  return ref;
}

/* ------------------------------------------------------------------ */
/*  Reveal — scroll-triggered fade + rise                              */
/* ------------------------------------------------------------------ */

export function Reveal({
  children,
  delay = 0,
  className = "",
}: {
  children: React.ReactNode;
  delay?: number;
  className?: string;
}) {
  const reduced = usePrefersReducedMotion();
  // Shown by default so SSR HTML, no-JS clients, and failed hydrations
  // always render content. Below-the-fold elements are hidden after mount
  // (off-screen, so no visible flash) and revealed on scroll.
  const [shown, setShown] = useState(true);
  const ref = useInView<HTMLDivElement>(() => setShown(true), "-40px");

  useEffect(() => {
    const el = ref.current;
    if (!el || reduced) return;
    if (!("IntersectionObserver" in window)) return;
    const rect = el.getBoundingClientRect();
    const inView = rect.top < window.innerHeight && rect.bottom > 0;
    if (!inView) setShown(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reduced]);

  const visible = reduced || shown;
  return (
    <div
      ref={ref}
      className={className}
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? "none" : "translateY(28px)",
        transition: reduced
          ? undefined
          : `opacity 0.8s cubic-bezier(0.22,1,0.36,1) ${delay}ms, transform 0.8s cubic-bezier(0.22,1,0.36,1) ${delay}ms`,
        willChange: "opacity, transform",
      }}
    >
      {children}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  CountUp — animated number that counts up when in view              */
/* ------------------------------------------------------------------ */

export function CountUp({
  to,
  decimals = 0,
  duration = 1400,
  suffix = "",
  prefix = "",
  className = "",
}: {
  to: number;
  decimals?: number;
  duration?: number;
  suffix?: string;
  prefix?: string;
  className?: string;
}) {
  const reduced = usePrefersReducedMotion();
  const [value, setValue] = useState(0);
  const start = () => {
    if (reduced) {
      setValue(to);
      return;
    }
    const startTime = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - startTime) / duration);
      // easeOutCubic
      const eased = 1 - Math.pow(1 - t, 3);
      setValue(to * eased);
      if (t < 1) requestAnimationFrame(tick);
      else setValue(to);
    };
    requestAnimationFrame(tick);
  };
  const ref = useInView<HTMLSpanElement>(start);

  return (
    <span ref={ref} className={className}>
      {prefix}
      {value.toLocaleString("en-US", {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      })}
      {suffix}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/*  ScoreDial — large animated Gift-Worthiness gauge                   */
/* ------------------------------------------------------------------ */

export function ScoreDial({
  score,
  size = 220,
  label = "Gift-Worthiness Score",
}: {
  score: number;
  size?: number;
  label?: string;
}) {
  const reduced = usePrefersReducedMotion();
  const clamped = Math.max(0, Math.min(10, score));
  const radius = 42;
  const circumference = 2 * Math.PI * radius;
  const [progress, setProgress] = useState(0);

  const start = () => {
    if (reduced) {
      setProgress(clamped / 10);
      return;
    }
    const duration = 1600;
    const startTime = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - startTime) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setProgress((clamped / 10) * eased);
      if (t < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  };
  const ref = useInView<HTMLDivElement>(start);

  const dash = circumference * progress;

  return (
    <div
      ref={ref}
      className="relative flex items-center justify-center"
      style={{ width: size, height: size }}
    >
      <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full -rotate-90">
        <circle
          cx="50"
          cy="50"
          r={radius}
          fill="none"
          stroke="rgba(255,255,255,0.12)"
          strokeWidth="3"
        />
        <circle
          cx="50"
          cy="50"
          r={radius}
          fill="none"
          stroke="var(--color-accent-light, #C9A96E)"
          strokeWidth="3.5"
          strokeLinecap="round"
          strokeDasharray={`${dash} ${circumference - dash}`}
          style={{
            filter:
              "drop-shadow(0 0 6px color-mix(in srgb, var(--color-accent-light, #C9A96E) 60%, transparent))",
          }}
        />
      </svg>
      <div className="flex flex-col items-center text-center">
        <span
          className="font-bold leading-none text-white"
          style={{ fontSize: size * 0.3, fontFamily: "var(--font-heading)" }}
        >
          <CountUp to={clamped} decimals={1} />
        </span>
        <span className="mt-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-white/55">
          out of 10
        </span>
      </div>
      <span className="sr-only">{`${label}: ${clamped.toFixed(1)} out of 10`}</span>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  MiniGauge — small scoring-criterion gauge                          */
/* ------------------------------------------------------------------ */

export function MiniGauge({ value, size = 84 }: { value: number; size?: number }) {
  const reduced = usePrefersReducedMotion();
  const clamped = Math.max(0, Math.min(10, value));
  const radius = 42;
  const circumference = 2 * Math.PI * radius;
  const [progress, setProgress] = useState(0);

  const start = () => {
    if (reduced) {
      setProgress(clamped / 10);
      return;
    }
    const duration = 1200;
    const startTime = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - startTime) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setProgress((clamped / 10) * eased);
      if (t < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  };
  const ref = useInView<HTMLDivElement>(start);
  const dash = circumference * progress;

  return (
    <div
      ref={ref}
      className="relative flex items-center justify-center"
      style={{ width: size, height: size }}
    >
      <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full -rotate-90">
        <circle
          cx="50"
          cy="50"
          r={radius}
          fill="none"
          stroke="rgba(27,42,74,0.1)"
          strokeWidth="6"
        />
        <circle
          cx="50"
          cy="50"
          r={radius}
          fill="none"
          stroke="var(--color-accent, #8B6914)"
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={`${dash} ${circumference - dash}`}
        />
      </svg>
      <span
        className="relative font-bold"
        style={{ color: "var(--color-primary)", fontSize: size * 0.26 }}
      >
        <CountUp to={clamped} decimals={1} />
      </span>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  LiveWatchDial — analog clock showing the real current time         */
/*  The unexpected design move: the page literally ticks.              */
/* ------------------------------------------------------------------ */

export function LiveWatchDial({ size = 132 }: { size?: number }) {
  const reduced = usePrefersReducedMotion();
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    const interval = setInterval(() => setNow(new Date()), reduced ? 1000 : 50);
    return () => clearInterval(interval);
  }, [reduced]);

  // Avoid hydration mismatch: render dial face on server, hands once mounted.
  const ms = now ? now.getMilliseconds() : 0;
  const s = now ? now.getSeconds() + (reduced ? 0 : ms / 1000) : 0;
  const m = now ? now.getMinutes() + s / 60 : 0;
  const h = now ? (now.getHours() % 12) + m / 60 : 0;

  const secAngle = s * 6;
  const minAngle = m * 6;
  const hourAngle = h * 30;

  const indices = Array.from({ length: 12 });

  return (
    <div
      className="relative rounded-full"
      style={{
        width: size,
        height: size,
        background: "radial-gradient(circle at 50% 35%, #233a63 0%, #1B2A4A 55%, #131f38 100%)",
        boxShadow:
          "inset 0 2px 10px rgba(0,0,0,0.5), 0 8px 30px rgba(0,0,0,0.45), 0 0 0 1px rgba(201,169,110,0.25)",
      }}
      aria-hidden="true"
    >
      <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full">
        {indices.map((_, i) => {
          const angle = (i * 30 * Math.PI) / 180;
          const isMajor = i % 3 === 0;
          const r1 = isMajor ? 38 : 40;
          const r2 = 44;
          return (
            <line
              key={i}
              x1={50 + r1 * Math.sin(angle)}
              y1={50 - r1 * Math.cos(angle)}
              x2={50 + r2 * Math.sin(angle)}
              y2={50 - r2 * Math.cos(angle)}
              stroke="var(--color-accent-light, #C9A96E)"
              strokeWidth={isMajor ? 1.8 : 0.8}
              strokeLinecap="round"
              opacity={isMajor ? 0.95 : 0.5}
            />
          );
        })}
        {/* hour hand */}
        <line
          x1="50"
          y1="54"
          x2="50"
          y2="29"
          stroke="#f4efe4"
          strokeWidth="2.6"
          strokeLinecap="round"
          transform={`rotate(${hourAngle} 50 50)`}
          style={{ visibility: now ? "visible" : "hidden" }}
        />
        {/* minute hand */}
        <line
          x1="50"
          y1="56"
          x2="50"
          y2="18"
          stroke="#f4efe4"
          strokeWidth="1.8"
          strokeLinecap="round"
          transform={`rotate(${minAngle} 50 50)`}
          style={{ visibility: now ? "visible" : "hidden" }}
        />
        {/* second hand */}
        <line
          x1="50"
          y1="60"
          x2="50"
          y2="14"
          stroke="var(--color-accent-light, #C9A96E)"
          strokeWidth="0.9"
          strokeLinecap="round"
          transform={`rotate(${secAngle} 50 50)`}
          style={{ visibility: now ? "visible" : "hidden" }}
        />
        <circle cx="50" cy="50" r="2.4" fill="var(--color-accent-light, #C9A96E)" />
        <circle cx="50" cy="50" r="0.9" fill="#1B2A4A" />
      </svg>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  ScrollProgress — thin gold power-reserve bar at the top            */
/* ------------------------------------------------------------------ */

export function ScrollProgress() {
  const [pct, setPct] = useState(0);
  useEffect(() => {
    const onScroll = () => {
      const h = document.documentElement;
      const max = h.scrollHeight - h.clientHeight;
      setPct(max > 0 ? (h.scrollTop / max) * 100 : 0);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <div
      className="fixed inset-x-0 top-0 z-50 h-[3px]"
      style={{ background: "transparent" }}
      aria-hidden="true"
    >
      <div
        className="h-full origin-left"
        style={{
          width: `${pct}%`,
          background:
            "linear-gradient(to right, color-mix(in srgb, var(--color-accent-light, #C9A96E) 40%, transparent), var(--color-accent-light, #C9A96E))",
          boxShadow:
            "0 0 8px color-mix(in srgb, var(--color-accent-light, #C9A96E) 70%, transparent)",
        }}
      />
    </div>
  );
}

"use client";

import { useEffect, useId, useState } from "react";

/* ------------------------------------------------------------------ */
/*  Shared helpers                                                     */
/* ------------------------------------------------------------------ */

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return reduced;
}

const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

/* ------------------------------------------------------------------ */
/*  CountUpValue — animated tabular number for KPI tiles               */
/* ------------------------------------------------------------------ */

export function CountUpValue({
  value,
  durationMs = 1100,
  decimals = 0,
  suffix = "",
}: {
  value: number;
  durationMs?: number;
  decimals?: number;
  suffix?: string;
}) {
  const reduced = usePrefersReducedMotion();
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    if (reduced) {
      setDisplay(value);
      return;
    }
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs);
      setDisplay(value * easeOutCubic(t));
      if (t < 1) raf = requestAnimationFrame(tick);
      else setDisplay(value);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, durationMs, reduced]);

  const formatted = display.toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });

  return (
    <span className="tabular-nums">
      {formatted}
      {suffix}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/*  Sparkline — tiny gold trend line + soft area fill                  */
/* ------------------------------------------------------------------ */

export function Sparkline({
  data,
  width = 120,
  height = 32,
  className = "",
}: {
  data: number[];
  width?: number;
  height?: number;
  className?: string;
}) {
  const gradientId = useId();
  if (data.length < 2) return null;

  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  const stepX = width / (data.length - 1);
  const pad = 2;
  const usableH = height - pad * 2;

  const points = data.map((d, i) => {
    const x = i * stepX;
    const y = pad + usableH - ((d - min) / range) * usableH;
    return [x, y] as const;
  });

  const line = points
    .map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`)
    .join(" ");
  const area = `${line} L${width},${height} L0,${height} Z`;

  return (
    <svg
      className={className}
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      fill="none"
      aria-hidden="true"
      preserveAspectRatio="none"
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--color-accent, currentColor)" stopOpacity="0.22" />
          <stop offset="100%" stopColor="var(--color-accent, currentColor)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${gradientId})`} />
      <path
        d={line}
        stroke="var(--color-accent, currentColor)"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/*  PowerReserveMeter — gold watch-complication health arc             */
/* ------------------------------------------------------------------ */

export function PowerReserveMeter({
  value,
  label = "Platform health",
  size = 132,
}: {
  value: number;
  /** 0–100 health score. */
  label?: string;
  size?: number;
}) {
  const reduced = usePrefersReducedMotion();
  const [shown, setShown] = useState(0);
  const clamped = Math.max(0, Math.min(100, value));

  useEffect(() => {
    if (reduced) {
      setShown(clamped);
      return;
    }
    let raf = 0;
    const start = performance.now();
    const duration = 1200;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      setShown(clamped * easeOutCubic(t));
      if (t < 1) raf = requestAnimationFrame(tick);
      else setShown(clamped);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [clamped, reduced]);

  // 270° sweep arc (watch power-reserve style), starting at 135°.
  const stroke = 7;
  const r = (size - stroke * 2) / 2;
  const cx = size / 2;
  const cy = size / 2;
  const startAngle = 135;
  const sweep = 270;
  const circumference = 2 * Math.PI * r;
  const arcFraction = sweep / 360;
  const dash = circumference * arcFraction;
  const filled = (shown / 100) * dash;

  const tone =
    clamped >= 80 ? "var(--color-accent, #C9A96E)" : clamped >= 50 ? "#d9a441" : "#dc6b4f";

  return (
    <div className="flex items-center gap-3">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
          <g transform={`rotate(${startAngle} ${cx} ${cy})`}>
            <circle
              cx={cx}
              cy={cy}
              r={r}
              fill="none"
              stroke="currentColor"
              strokeOpacity={0.12}
              strokeWidth={stroke}
              strokeLinecap="round"
              strokeDasharray={`${dash} ${circumference}`}
            />
            <circle
              cx={cx}
              cy={cy}
              r={r}
              fill="none"
              stroke={tone}
              strokeWidth={stroke}
              strokeLinecap="round"
              strokeDasharray={`${filled} ${circumference}`}
            />
          </g>
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-semibold tabular-nums text-foreground">
            {Math.round(shown)}
          </span>
          <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            / 100
          </span>
        </div>
      </div>
      <div className="max-w-[8rem]">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {label}
        </p>
        <p className="mt-0.5 text-sm font-medium text-foreground">
          {clamped >= 80 ? "Healthy" : clamped >= 50 ? "Needs attention" : "Action required"}
        </p>
      </div>
    </div>
  );
}

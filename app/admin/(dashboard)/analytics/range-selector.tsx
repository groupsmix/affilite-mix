"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CalendarIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import {
  ANALYTICS_RANGE_PRESETS,
  DEFAULT_ANALYTICS_RANGE_PRESET,
  type AnalyticsRangePreset,
} from "@/lib/analytics/range";

const PRESET_LABELS: Record<Exclude<AnalyticsRangePreset, "custom">, string> = {
  "24h": "24h",
  "7d": "7d",
  "30d": "30d",
};

const PRESET_ORDER = ANALYTICS_RANGE_PRESETS.filter((p) => p !== "custom") as Exclude<
  AnalyticsRangePreset,
  "custom"
>[];

function isPreset(v: string | null): v is AnalyticsRangePreset {
  return !!v && (ANALYTICS_RANGE_PRESETS as readonly string[]).includes(v);
}

/**
 * URL-synced date-range picker for /admin/analytics.
 *
 * Writes `?range=<preset>` or `?range=custom&from=<iso>&to=<iso>` to the
 * URL; the server page re-renders with the new window. Kept deliberately
 * small — no third-party date picker, just native `<input type="date">`
 * so the component works in all browsers without extra dependencies.
 */
export function RangeSelector() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  const rangeParam = searchParams.get("range");
  const activePreset: AnalyticsRangePreset = isPreset(rangeParam)
    ? rangeParam
    : DEFAULT_ANALYTICS_RANGE_PRESET;

  const fromParam = searchParams.get("from") ?? "";
  const toParam = searchParams.get("to") ?? "";

  const [open, setOpen] = useState(false);
  const [fromValue, setFromValue] = useState(fromParam ? fromParam.slice(0, 10) : "");
  const [toValue, setToValue] = useState(toParam ? toParam.slice(0, 10) : "");

  useEffect(() => {
    setFromValue(fromParam ? fromParam.slice(0, 10) : "");
    setToValue(toParam ? toParam.slice(0, 10) : "");
  }, [fromParam, toParam]);

  const pushParams = useCallback(
    (build: (p: URLSearchParams) => void) => {
      const params = new URLSearchParams(searchParams.toString());
      build(params);
      const qs = params.toString();
      startTransition(() => {
        router.push(qs ? `?${qs}` : "?", { scroll: false });
      });
    },
    [router, searchParams],
  );

  const selectPreset = useCallback(
    (preset: AnalyticsRangePreset) => {
      pushParams((p) => {
        if (preset === DEFAULT_ANALYTICS_RANGE_PRESET) {
          p.delete("range");
        } else {
          p.set("range", preset);
        }
        p.delete("from");
        p.delete("to");
      });
    },
    [pushParams],
  );

  const applyCustom = useCallback(() => {
    if (!fromValue || !toValue) return;
    pushParams((p) => {
      p.set("range", "custom");
      p.set("from", new Date(`${fromValue}T00:00:00.000Z`).toISOString());
      p.set("to", new Date(`${toValue}T23:59:59.999Z`).toISOString());
    });
    setOpen(false);
  }, [fromValue, toValue, pushParams]);

  return (
    <div
      className="flex items-center gap-1 rounded-md border border-input bg-background p-1 shadow-xs"
      role="group"
      aria-label="Analytics date range"
    >
      {PRESET_ORDER.map((p) => (
        <Button
          key={p}
          type="button"
          size="sm"
          variant={activePreset === p ? "default" : "ghost"}
          className="h-7 px-2.5 text-xs"
          aria-pressed={activePreset === p}
          onClick={() => selectPreset(p)}
        >
          {PRESET_LABELS[p]}
        </Button>
      ))}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            size="sm"
            variant={activePreset === "custom" ? "default" : "ghost"}
            className={cn("h-7 gap-1 px-2.5 text-xs")}
            aria-pressed={activePreset === "custom"}
            aria-label="Custom date range"
          >
            <CalendarIcon className="size-3.5" aria-hidden />
            <span>Custom</span>
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-auto space-y-3 p-3">
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground" htmlFor="range-from">
              From
            </label>
            <input
              id="range-from"
              type="date"
              value={fromValue}
              onChange={(e) => setFromValue(e.target.value)}
              className="block w-full rounded-md border border-input bg-background px-2 py-1 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground" htmlFor="range-to">
              To
            </label>
            <input
              id="range-to"
              type="date"
              value={toValue}
              onChange={(e) => setToValue(e.target.value)}
              className="block w-full rounded-md border border-input bg-background px-2 py-1 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => {
                setFromValue("");
                setToValue("");
                selectPreset(DEFAULT_ANALYTICS_RANGE_PRESET);
                setOpen(false);
              }}
            >
              Clear
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={applyCustom}
              disabled={!fromValue || !toValue || fromValue >= toValue}
            >
              Apply
            </Button>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}

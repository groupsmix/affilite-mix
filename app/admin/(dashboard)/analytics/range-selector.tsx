"use client";

import { type ChangeEvent, useEffect, useMemo, useState } from "react";
import { CalendarIcon } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import {
  ANALYTICS_RANGE_PRESETS,
  buildAnalyticsRangeQuery,
  getAnalyticsRangeLabel,
  parseAnalyticsRange,
  toDateInputValue,
  type AnalyticsRangePreset,
} from "@/lib/analytics/range";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";

const PRESET_OPTIONS: { value: AnalyticsRangePreset; label: string }[] =
  ANALYTICS_RANGE_PRESETS.map((value) => ({
    value,
    label: getAnalyticsRangeLabel(value),
  }));

function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

export function RangeSelector() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const current = useMemo(() => parseAnalyticsRange(searchParams), [searchParams]);

  const [open, setOpen] = useState(false);
  const [fromValue, setFromValue] = useState(current.fromInput);
  const [toValue, setToValue] = useState(current.toInput);

  useEffect(() => {
    setFromValue(current.fromInput);
    setToValue(current.toInput);
  }, [current.fromInput, current.toInput]);

  function navigateWithQuery(queryString: string) {
    router.push(queryString ? `${pathname}?${queryString}` : pathname, { scroll: false });
  }

  function applyPreset(range: AnalyticsRangePreset) {
    const query = buildAnalyticsRangeQuery(range, { preserve: searchParams, dropKeys: ["page"] });
    navigateWithQuery(query);
    setOpen(false);
  }

  function applyCustomRange() {
    const query = buildAnalyticsRangeQuery("custom", {
      from: fromValue || null,
      to: toValue || null,
      preserve: searchParams,
      dropKeys: ["page"],
    });
    navigateWithQuery(query);
    setOpen(false);
  }

  function resetToDefault() {
    const query = buildAnalyticsRangeQuery("30d", { preserve: searchParams, dropKeys: ["page"] });
    navigateWithQuery(query);
    setOpen(false);
  }

  const triggerLabel = current.isCustom ? current.label : getAnalyticsRangeLabel(current.key);

  const customPreview = getAnalyticsRangeLabel(
    "custom",
    fromValue || undefined,
    toValue || undefined,
  );

  const canApplyCustom = Boolean(fromValue || toValue);

  return (
    <div className="flex items-center justify-end">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="sm"
            aria-label={`Analytics date range: ${triggerLabel}`}
            className="min-w-[170px] justify-start gap-2 text-start"
          >
            <CalendarIcon className="size-4 shrink-0" />
            <span className="truncate">{triggerLabel}</span>
          </Button>
        </PopoverTrigger>

        <PopoverContent
          align="end"
          className="w-[min(92vw,22rem)]"
          aria-label="Analytics date range options"
        >
          <PopoverHeader>
            <PopoverTitle>Filter analytics range</PopoverTitle>
            <PopoverDescription>
              Choose a preset window or apply a custom from/to range.
            </PopoverDescription>
          </PopoverHeader>

          <div className="mt-4 space-y-4">
            <div className="space-y-2">
              <Label id="analytics-range-presets-label">Quick ranges</Label>
              <div
                aria-labelledby="analytics-range-presets-label"
                className="grid grid-cols-1 gap-2 sm:grid-cols-3"
              >
                {PRESET_OPTIONS.map((option) => {
                  const selected = !current.isCustom && current.key === option.value;
                  return (
                    <Button
                      key={option.value}
                      type="button"
                      variant={selected ? "default" : "outline"}
                      size="sm"
                      aria-pressed={selected}
                      aria-label={`Show analytics for ${option.label.toLowerCase()}`}
                      onClick={() => applyPreset(option.value)}
                      className={cx("justify-center", selected && "shadow-none")}
                    >
                      {option.label}
                    </Button>
                  );
                })}
              </div>
            </div>

            <Separator />

            <div className="space-y-3">
              <div className="space-y-1">
                <Label className="text-sm">Custom range</Label>
                <p className="text-xs text-muted-foreground">{customPreview}</p>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="analytics-range-from">From</Label>
                  <Input
                    id="analytics-range-from"
                    type="date"
                    value={fromValue}
                    onChange={(event: ChangeEvent<HTMLInputElement>) =>
                      setFromValue(toDateInputValue(event.target.value))
                    }
                    aria-label="Analytics custom range start date"
                    max={toValue || undefined}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="analytics-range-to">To</Label>
                  <Input
                    id="analytics-range-to"
                    type="date"
                    value={toValue}
                    onChange={(event: ChangeEvent<HTMLInputElement>) =>
                      setToValue(toDateInputValue(event.target.value))
                    }
                    aria-label="Analytics custom range end date"
                    min={fromValue || undefined}
                  />
                </div>
              </div>

              <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={resetToDefault}
                  aria-label="Reset analytics range to last 30 days"
                >
                  Reset
                </Button>
                <Button
                  type="button"
                  size="sm"
                  onClick={applyCustomRange}
                  disabled={!canApplyCustom}
                  aria-label="Apply custom analytics date range"
                >
                  Apply custom range
                </Button>
              </div>
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}

export default RangeSelector;

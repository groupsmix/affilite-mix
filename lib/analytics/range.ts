/**
 * Shared range-parsing helpers for /admin/analytics.
 *
 * The analytics page is server-rendered; the URL is the single source of
 * truth for the selected window. The page reads `searchParams` and calls
 * `resolveAnalyticsRange()` to turn them into a concrete `{ from, to }`
 * window that downstream DAL calls can consume.
 *
 * Contract (kept intentionally small so it can be reused by the client
 * <RangeSelector/> without duplication):
 *
 *   ?range=24h | 7d | 30d | custom
 *   ?from=<iso>&to=<iso>   (only read when range=custom)
 *
 * Unknown or malformed values fall back to the 7d preset — matching the
 * prominence the 7d window had in the previous dashboard.
 */

export const ANALYTICS_RANGE_PRESETS = ["24h", "7d", "30d", "custom"] as const;
export type AnalyticsRangePreset = (typeof ANALYTICS_RANGE_PRESETS)[number];

export const DEFAULT_ANALYTICS_RANGE_PRESET: AnalyticsRangePreset = "7d";

export interface AnalyticsRange {
  /** Inclusive start of the window. */
  from: Date;
  /** Inclusive end of the window (defaults to "now"). */
  to: Date;
  /** The preset key, after fallback. Used to highlight the active button. */
  preset: AnalyticsRangePreset;
  /** Convenience ISO for DAL calls that accept a `since` string. */
  fromIso: string;
  /** Convenience ISO for DAL calls that accept a `to` / `endDate` string. */
  toIso: string;
  /** Whole-day count between from/to, rounded up. Used e.g. for getDailyClicks. */
  days: number;
}

export interface AnalyticsRangeSearchParams {
  range?: string | string[];
  from?: string | string[];
  to?: string | string[];
}

function pickString(v: string | string[] | undefined): string | undefined {
  if (Array.isArray(v)) return v[0];
  return v;
}

function isValidDate(d: Date): boolean {
  return !Number.isNaN(d.getTime());
}

function daysBetween(from: Date, to: Date): number {
  const MS_PER_DAY = 24 * 60 * 60 * 1000;
  const diff = to.getTime() - from.getTime();
  return Math.max(1, Math.ceil(diff / MS_PER_DAY));
}

function isPreset(v: string | undefined): v is AnalyticsRangePreset {
  return !!v && (ANALYTICS_RANGE_PRESETS as readonly string[]).includes(v);
}

/**
 * Resolve `searchParams` into a concrete analytics window.
 *
 * `now` is injected so tests can pin it deterministically.
 */
export function resolveAnalyticsRange(
  params: AnalyticsRangeSearchParams,
  now: Date = new Date(),
): AnalyticsRange {
  const rangeRaw = pickString(params.range);
  const preset: AnalyticsRangePreset = isPreset(rangeRaw)
    ? rangeRaw
    : DEFAULT_ANALYTICS_RANGE_PRESET;

  if (preset === "custom") {
    const fromParam = pickString(params.from);
    const toParam = pickString(params.to);
    const from = fromParam ? new Date(fromParam) : null;
    const to = toParam ? new Date(toParam) : null;
    if (from && to && isValidDate(from) && isValidDate(to) && from < to) {
      return {
        from,
        to,
        preset: "custom",
        fromIso: from.toISOString(),
        toIso: to.toISOString(),
        days: daysBetween(from, to),
      };
    }
    // Invalid custom range — silently fall back to default preset rather
    // than crashing the page.
  }

  const to = now;
  let from: Date;
  let days: number;
  switch (preset) {
    case "24h":
      from = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      days = 1;
      break;
    case "30d":
      from = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      days = 30;
      break;
    case "7d":
    case "custom":
    default:
      from = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      days = 7;
      break;
  }

  return {
    from,
    to,
    preset: preset === "custom" ? DEFAULT_ANALYTICS_RANGE_PRESET : preset,
    fromIso: from.toISOString(),
    toIso: to.toISOString(),
    days,
  };
}

/** Human label used in card descriptions and mobile summaries. */
export function rangeLabel(range: AnalyticsRange): string {
  switch (range.preset) {
    case "24h":
      return "Last 24h";
    case "30d":
      return "Last 30 days";
    case "custom":
      return `${range.from.toISOString().slice(0, 10)} → ${range.to.toISOString().slice(0, 10)}`;
    case "7d":
    default:
      return "Last 7 days";
  }
}

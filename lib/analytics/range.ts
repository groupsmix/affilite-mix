export const ANALYTICS_RANGE_PRESETS = ["24h", "7d", "30d"] as const;

export type AnalyticsRangePreset = (typeof ANALYTICS_RANGE_PRESETS)[number];

export const DEFAULT_ANALYTICS_RANGE: AnalyticsRangePreset = "30d";

export interface AnalyticsRangeSearchParams {
  range?: string;
  from?: string;
  to?: string;
}

type SearchParamsGetter = {
  get(name: string): string | null;
};

type SearchParamsEntries = {
  entries(): IterableIterator<[string, string]>;
};

type SearchParamsLike = AnalyticsRangeSearchParams | URLSearchParams | SearchParamsGetter;

function hasSearchParamGetter(value: unknown): value is SearchParamsGetter {
  return (
    typeof value === "object" &&
    value !== null &&
    "get" in value &&
    typeof (value as { get?: unknown }).get === "function"
  );
}

function hasSearchParamEntries(value: unknown): value is SearchParamsEntries {
  return (
    typeof value === "object" &&
    value !== null &&
    "entries" in value &&
    typeof (value as { entries?: unknown }).entries === "function"
  );
}

function readSearchParam(
  searchParams: SearchParamsLike,
  key: keyof AnalyticsRangeSearchParams,
): string | undefined {
  if (hasSearchParamGetter(searchParams)) {
    const value = searchParams.get(key);
    return value ?? undefined;
  }

  return searchParams[key];
}

export interface AnalyticsRange {
  key: AnalyticsRangePreset | "custom";
  label: string;
  since: string;
  until?: string;
  daysForChart: number;
  fromInput: string;
  toInput: string;
  isCustom: boolean;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function isPreset(value: string | undefined): value is AnalyticsRangePreset {
  return ANALYTICS_RANGE_PRESETS.includes(value as AnalyticsRangePreset);
}

function parseDate(value: string | undefined): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function startOfUtcDay(date: Date): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 0, 0, 0, 0),
  );
}

function endOfUtcDay(date: Date): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 23, 59, 59, 999),
  );
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * MS_PER_DAY);
}

function clampToNow(date: Date, now: Date): Date {
  return date.getTime() > now.getTime() ? now : date;
}

function diffCalendarDaysInclusive(start: Date, end: Date): number {
  const startUtc = startOfUtcDay(start).getTime();
  const endUtc = startOfUtcDay(end).getTime();
  return Math.max(1, Math.floor((endUtc - startUtc) / MS_PER_DAY) + 1);
}

export function toDateInputValue(value: string | Date | null | undefined): string {
  if (!value) return "";
  const date = value instanceof Date ? value : parseDate(value);
  if (!date) return "";
  return date.toISOString().slice(0, 10);
}

export function getAnalyticsRangeLabel(
  key: AnalyticsRangePreset | "custom",
  fromInput?: string,
  toInput?: string,
): string {
  switch (key) {
    case "24h":
      return "Last 24 hours";
    case "7d":
      return "Last 7 days";
    case "30d":
      return "Last 30 days";
    case "custom":
    default:
      if (fromInput && toInput) return `${fromInput} → ${toInput}`;
      if (fromInput) return `From ${fromInput}`;
      if (toInput) return `Until ${toInput}`;
      return "Custom range";
  }
}

export function parseAnalyticsRange(
  searchParams: SearchParamsLike,
  now = new Date(),
): AnalyticsRange {
  const rangeValue = readSearchParam(searchParams, "range");
  const fromValue = readSearchParam(searchParams, "from");
  const toValue = readSearchParam(searchParams, "to");

  const fromDate = parseDate(fromValue);
  const toDate = parseDate(toValue);

  if (fromDate || toDate) {
    const sinceDate = fromDate ? startOfUtcDay(fromDate) : startOfUtcDay(addDays(now, -29));
    const rawUntilDate = toDate ? endOfUtcDay(toDate) : now;
    const untilDate = clampToNow(rawUntilDate, now);

    const normalizedSince =
      sinceDate.getTime() > untilDate.getTime() ? startOfUtcDay(untilDate) : sinceDate;
    const daysForChart = diffCalendarDaysInclusive(normalizedSince, untilDate);

    const fromInput = toDateInputValue(normalizedSince);
    const toInput = toDateInputValue(untilDate);

    return {
      key: "custom",
      label: getAnalyticsRangeLabel("custom", fromInput, toInput),
      since: normalizedSince.toISOString(),
      until: untilDate.toISOString(),
      daysForChart,
      fromInput,
      toInput,
      isCustom: true,
    };
  }

  const preset: AnalyticsRangePreset = isPreset(rangeValue) ? rangeValue : DEFAULT_ANALYTICS_RANGE;

  let sinceDate: Date;
  switch (preset) {
    case "24h":
      sinceDate = new Date(now.getTime() - MS_PER_DAY);
      break;
    case "7d":
      sinceDate = new Date(now.getTime() - 7 * MS_PER_DAY);
      break;
    case "30d":
    default:
      sinceDate = new Date(now.getTime() - 30 * MS_PER_DAY);
      break;
  }

  return {
    key: preset,
    label: getAnalyticsRangeLabel(preset),
    since: sinceDate.toISOString(),
    until: undefined,
    daysForChart: preset === "24h" ? 2 : Number.parseInt(preset, 10),
    fromInput: "",
    toInput: "",
    isCustom: false,
  };
}

export function buildAnalyticsRangeQuery(
  range: AnalyticsRangePreset | "custom",
  options?: {
    from?: string | Date | null;
    to?: string | Date | null;
    preserve?:
      | URLSearchParams
      | Record<string, string | string[] | undefined>
      | {
          get(name: string): string | null;
          entries?: () => IterableIterator<[string, string]>;
        };
    dropKeys?: string[];
  },
): string {
  const params = new URLSearchParams();

  const preserve = options?.preserve;
  if (hasSearchParamEntries(preserve)) {
    for (const [key, value] of preserve.entries()) {
      params.append(key, value);
    }
  } else if (preserve) {
    for (const [key, value] of Object.entries(preserve)) {
      if (value == null || typeof value === "function") continue;
      if (Array.isArray(value)) {
        for (const item of value) params.append(key, item);
      } else {
        params.set(key, value);
      }
    }
  }

  for (const key of options?.dropKeys ?? []) {
    params.delete(key);
  }

  params.delete("page");
  params.delete("range");
  params.delete("from");
  params.delete("to");

  if (range === "custom") {
    const fromInput = toDateInputValue(options?.from);
    const toInput = toDateInputValue(options?.to);

    if (fromInput) {
      params.set("from", startOfUtcDay(new Date(`${fromInput}T00:00:00.000Z`)).toISOString());
    }
    if (toInput) {
      params.set("to", endOfUtcDay(new Date(`${toInput}T00:00:00.000Z`)).toISOString());
    }
  } else {
    params.set("range", range);
  }

  return params.toString();
}

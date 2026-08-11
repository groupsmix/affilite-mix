/**
 * Schema validation for affiliate-network commission reports.
 *
 * The cron route validates every raw commission before it reaches the DAL,
 * so malformed payloads from a network API cannot insert garbage or bypass
 * deduplication. Invalid rows are discarded and logged rather than failing
 * the entire batch.
 */

export interface CommissionReport {
  tracking_key: string;
  product_id?: string;
  click_id?: string;
  network: string;
  order_id?: string;
  commission_amount: number;
  currency?: string;
  status?: string;
  sale_amount?: number;
  event_date: string;
  raw_data?: Record<string, unknown>;
}

type ValidationResult = { data: CommissionReport; errors: null } | { data: null; errors: string[] };

/**
 * `commissions.commission_amount` / `sale_amount` are NUMERIC(12,2) with a
 * non-negativity constraint. Bound the value here so an out-of-range or
 * negative payout from a network API is discarded and logged instead of
 * failing the insert (or, for extra decimals, being silently rounded by
 * PostgreSQL in a way the ingest log never records).
 */
const MAX_MONEY = 10_000_000_000; // NUMERIC(12,2) holds at most 10 integer digits

function isStorableAmount(value: number): boolean {
  return Number.isFinite(value) && value >= 0 && value < MAX_MONEY;
}

/**
 * Round to cents through integer math so the stored value matches what
 * PostgreSQL would store, without accumulating IEEE-754 drift in the
 * aggregates computed before insertion.
 */
export function toStoredAmount(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function isIso8601ish(value: string): boolean {
  // Accept ISO-8601 dates/datetimes, but also YYYY-MM-DD so network APIs that
  // return date-only event dates don't get rejected.
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return true;
  const d = new Date(value);
  return !Number.isNaN(d.getTime());
}

export function validateCommissionReport(input: unknown): ValidationResult {
  const errors: string[] = [];

  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { data: null, errors: ["expected object"] };
  }

  const raw = input as Record<string, unknown>;

  if (typeof raw.tracking_key !== "string" || raw.tracking_key.trim() === "") {
    errors.push("tracking_key must be a non-empty string");
  }

  if (typeof raw.network !== "string" || raw.network.trim() === "") {
    errors.push("network must be a non-empty string");
  }

  if (typeof raw.commission_amount !== "number" || !Number.isFinite(raw.commission_amount)) {
    errors.push("commission_amount must be a finite number");
  } else if (!isStorableAmount(raw.commission_amount)) {
    errors.push("commission_amount must be >= 0 and within NUMERIC(12,2)");
  }

  if (typeof raw.event_date !== "string" || !isIso8601ish(raw.event_date)) {
    errors.push("event_date must be an ISO-8601 date/datetime");
  }

  if (raw.product_id !== undefined && typeof raw.product_id !== "string") {
    errors.push("product_id must be a string when provided");
  }

  if (raw.click_id !== undefined && typeof raw.click_id !== "string") {
    errors.push("click_id must be a string when provided");
  }

  if (raw.order_id !== undefined && typeof raw.order_id !== "string") {
    errors.push("order_id must be a string when provided");
  }

  if (raw.currency !== undefined && typeof raw.currency !== "string") {
    errors.push("currency must be a string when provided");
  }

  if (raw.status !== undefined && typeof raw.status !== "string") {
    errors.push("status must be a string when provided");
  }

  if (raw.sale_amount !== undefined) {
    if (typeof raw.sale_amount !== "number" || !Number.isFinite(raw.sale_amount)) {
      errors.push("sale_amount must be a finite number when provided");
    } else if (!isStorableAmount(raw.sale_amount)) {
      errors.push("sale_amount must be >= 0 and within NUMERIC(12,2)");
    }
  }

  if (
    raw.raw_data !== undefined &&
    (typeof raw.raw_data !== "object" || raw.raw_data === null || Array.isArray(raw.raw_data))
  ) {
    errors.push("raw_data must be an object when provided");
  }

  if (errors.length > 0) {
    return { data: null, errors };
  }

  const report: CommissionReport = {
    tracking_key: String(raw.tracking_key),
    network: String(raw.network),
    commission_amount: toStoredAmount(Number(raw.commission_amount)),
    event_date: String(raw.event_date),
  };

  if (typeof raw.product_id === "string") report.product_id = raw.product_id;
  if (typeof raw.click_id === "string") report.click_id = raw.click_id;
  if (typeof raw.order_id === "string") report.order_id = raw.order_id;
  if (typeof raw.currency === "string") report.currency = raw.currency;
  if (typeof raw.status === "string") report.status = raw.status;
  if (typeof raw.sale_amount === "number") report.sale_amount = toStoredAmount(raw.sale_amount);
  if (raw.raw_data && typeof raw.raw_data === "object" && !Array.isArray(raw.raw_data)) {
    report.raw_data = raw.raw_data as Record<string, unknown>;
  }

  return { data: report, errors: null };
}

/**
 * A76-F1: Global per-request retry budget.
 *
 * Prevents cascading retry storms during outages. A single user request might
 * trigger multiple retryable calls (DB lookup + KV read + AI provider + audit log).
 * Without a budget, one request could generate 10+ outbound attempts, amplifying
 * load during an outage.
 *
 * Usage:
 *   const budget = createRetryBudget();
 *   // Pass to retryable operations:
 *   if (!budget.canRetry()) return; // fail fast
 *   budget.recordRetry();
 */

/**
 * Maximum total retries across ALL external calls within a single request.
 * Configurable via env var for operational flexibility during incidents.
 */
const DEFAULT_MAX_RETRIES_PER_REQUEST = 5;

function getMaxRetriesPerRequest(): number {
  const raw = process.env.AI_MAX_RETRIES_PER_REQUEST;
  if (!raw) return DEFAULT_MAX_RETRIES_PER_REQUEST;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_MAX_RETRIES_PER_REQUEST;
  return parsed;
}

export interface RetryBudget {
  /** Returns true if there's remaining retry budget. */
  canRetry(): boolean;
  /** Record that a retry was consumed. */
  recordRetry(): void;
  /** Current number of retries consumed. */
  readonly consumed: number;
  /** Maximum allowed retries for this request. */
  readonly max: number;
}

/**
 * Create a retry budget scoped to a single request lifecycle.
 * Pass this through the request context to all retryable operations.
 */
export function createRetryBudget(maxRetries?: number): RetryBudget {
  const max = maxRetries ?? getMaxRetriesPerRequest();
  let consumed = 0;

  return {
    canRetry(): boolean {
      return consumed < max;
    },
    recordRetry(): void {
      consumed++;
    },
    get consumed() {
      return consumed;
    },
    get max() {
      return max;
    },
  };
}

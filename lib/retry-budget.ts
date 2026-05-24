/**
 * A76-F1 / A100-06: Global retry budget across the request lifecycle.
 *
 * Prevents cascading retry storms. Each request gets a fixed budget of
 * retries across ALL downstream calls (KV, DB, external APIs). Once the
 * budget is exhausted, subsequent operations must fail fast rather than
 * queueing additional retries.
 *
 * Usage:
 *   const budget = createRetryBudget();
 *   // In each downstream call:
 *   if (budget.canRetry()) { budget.consume(); /* do retry * / }
 */

const DEFAULT_MAX_RETRIES = 3;

export interface RetryBudget {
  /** Whether another retry is allowed within this request's budget. */
  canRetry(): boolean;
  /** Consume one retry from the budget. */
  consume(): void;
  /** Number of retries remaining. */
  remaining(): number;
}

/**
 * Create a per-request retry budget.
 *
 * @param maxRetries - Total retries allowed across all downstream calls
 *                     within a single request lifecycle. Default: 3.
 */
export function createRetryBudget(maxRetries = DEFAULT_MAX_RETRIES): RetryBudget {
  let used = 0;

  return {
    canRetry() {
      return used < maxRetries;
    },
    consume() {
      used++;
    },
    remaining() {
      return Math.max(0, maxRetries - used);
    },
  };
}

/**
 * Execute an async operation with retry support using the budget.
 * Retries on transient errors only (network errors, 5xx, timeouts).
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  budget: RetryBudget,
  options?: { delayMs?: number; isRetryable?: (err: unknown) => boolean },
): Promise<T> {
  const delayMs = options?.delayMs ?? 100;
  const isRetryable =
    options?.isRetryable ??
    ((err: unknown) => {
      if (err instanceof Error) {
        // Retry on network errors and timeouts
        return (
          err.message.includes("timeout") ||
          err.message.includes("network") ||
          err.message.includes("ECONNREFUSED") ||
          err.message.includes("503")
        );
      }
      return false;
    });

  let lastError: unknown;
  // First attempt + retries from budget
  while (true) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (!isRetryable(err) || !budget.canRetry()) {
        throw err;
      }
      budget.consume();
      if (delayMs > 0) {
        await new Promise((r) => setTimeout(r, delayMs));
      }
    }
  }
}

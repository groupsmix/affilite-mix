/**
 * OF-14: Per-provider circuit breaker for AI API calls.
 *
 * Implements a simple three-state circuit breaker (CLOSED → OPEN → HALF_OPEN)
 * per AI provider name. Prevents cascading failures when a provider is down.
 *
 * State transitions:
 *   CLOSED     → OPEN      after `failureThreshold` consecutive failures
 *   OPEN       → HALF_OPEN after `recoveryWindowMs` has elapsed
 *   HALF_OPEN  → CLOSED    on the next successful call
 *   HALF_OPEN  → OPEN      on the next failed call
 */

export type CircuitState = "CLOSED" | "OPEN" | "HALF_OPEN";

interface BreakerState {
  state: CircuitState;
  failures: number;
  openedAt: number | null;
}

const DEFAULT_FAILURE_THRESHOLD = 5;
const DEFAULT_RECOVERY_WINDOW_MS = 30_000; // 30 seconds

const breakers = new Map<string, BreakerState>();

function getBreaker(provider: string): BreakerState {
  if (!breakers.has(provider)) {
    breakers.set(provider, { state: "CLOSED", failures: 0, openedAt: null });
  }
  return breakers.get(provider)!;
}

export class CircuitOpenError extends Error {
  constructor(provider: string) {
    super(`Circuit breaker OPEN for provider: ${provider}`);
    this.name = "CircuitOpenError";
  }
}

/**
 * Wraps an AI provider call with circuit-breaker protection.
 *
 * @example
 * const result = await withCircuitBreaker("groq", () =>
 *   groqClient.chat.completions.create({ ... })
 * );
 */
export async function withCircuitBreaker<T>(
  provider: string,
  fn: () => Promise<T>,
  options: {
    failureThreshold?: number;
    recoveryWindowMs?: number;
  } = {},
): Promise<T> {
  const {
    failureThreshold = DEFAULT_FAILURE_THRESHOLD,
    recoveryWindowMs = DEFAULT_RECOVERY_WINDOW_MS,
  } = options;

  const breaker = getBreaker(provider);

  if (breaker.state === "OPEN") {
    const elapsed = Date.now() - (breaker.openedAt ?? 0);
    if (elapsed >= recoveryWindowMs) {
      breaker.state = "HALF_OPEN";
    } else {
      throw new CircuitOpenError(provider);
    }
  }

  try {
    const result = await fn();

    // Success — reset the breaker
    breaker.state = "CLOSED";
    breaker.failures = 0;
    breaker.openedAt = null;

    return result;
  } catch (err) {
    breaker.failures += 1;

    if (breaker.state === "HALF_OPEN" || breaker.failures >= failureThreshold) {
      breaker.state = "OPEN";
      breaker.openedAt = Date.now();
    }

    throw err;
  }
}

/** Returns current circuit state for a provider (for health endpoints / metrics). */
export function getCircuitState(provider: string): CircuitState {
  return getBreaker(provider).state;
}

/** Manually reset a circuit (for ops/admin use). */
export function resetCircuit(provider: string): void {
  breakers.set(provider, { state: "CLOSED", failures: 0, openedAt: null });
}

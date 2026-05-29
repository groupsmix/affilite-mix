/**
 * OF-13: AI provider circuit breaker.
 *
 * A lightweight in-process circuit breaker for AI provider HTTP calls.
 * Prevents cascading failures when an upstream provider is degraded by
 * short-circuiting calls after a threshold of consecutive failures and
 * re-probing after a configurable cool-down window.
 *
 * States:
 *   CLOSED   — normal operation; failures are counted.
 *   OPEN     — calls are rejected immediately; a probe is scheduled.
 *   HALF_OPEN — one trial call is let through to test recovery.
 *
 * S5-07: Best-effort / per-isolate limitation.
 * On Cloudflare Workers each isolate is independent and short-lived,
 * so the breaker state (stored in the module-level `registry` Map) is
 * NOT shared across isolates. A provider that is failing fleet-wide
 * will be re-probed independently by every isolate; the breaker rarely
 * reaches a useful fleet-wide OPEN state. This is acceptable because
 * the per-provider fallback chain already provides availability —
 * when one provider fails, the next is tried. To achieve fleet-wide
 * trip state, back the registry with KV or a Durable Object (low
 * priority — the fallback chain is the primary availability mechanism).
 *
 * Usage (in lib/ai/providers.ts or any provider wrapper):
 *   import { getCircuitBreaker } from "@/lib/ai/circuit-breaker";
 *   const cb = getCircuitBreaker("groq");
 *   const result = await cb.execute(() => groqClient.chat(...));
 */

export type CircuitState = "CLOSED" | "OPEN" | "HALF_OPEN";

export interface CircuitBreakerOptions {
  /** Number of consecutive failures before opening the circuit (default 5). */
  failureThreshold?: number;
  /** Milliseconds to wait before transitioning OPEN → HALF_OPEN (default 30 000). */
  recoveryTimeoutMs?: number;
  /** Milliseconds since last state change after which the breaker resets to CLOSED (default 300 000). */
  resetTimeoutMs?: number;
}

export class CircuitBreaker {
  private state: CircuitState = "CLOSED";
  private failures = 0;
  private lastStateChangeAt = Date.now();
  private readonly failureThreshold: number;
  private readonly recoveryTimeoutMs: number;
  private readonly resetTimeoutMs: number;

  constructor(
    public readonly name: string,
    options: CircuitBreakerOptions = {},
  ) {
    this.failureThreshold = options.failureThreshold ?? 5;
    this.recoveryTimeoutMs = options.recoveryTimeoutMs ?? 30_000;
    this.resetTimeoutMs = options.resetTimeoutMs ?? 300_000;
  }

  getState(): CircuitState {
    if (this.state === "OPEN") {
      const elapsed = Date.now() - this.lastStateChangeAt;
      if (elapsed >= this.recoveryTimeoutMs) {
        this.transitionTo("HALF_OPEN");
      }
    }
    return this.state;
  }

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    const currentState = this.getState();

    if (currentState === "OPEN") {
      throw new CircuitOpenError(this.name);
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (err) {
      this.onFailure();
      throw err;
    }
  }

  private onSuccess(): void {
    this.failures = 0;
    if (this.state !== "CLOSED") {
      this.transitionTo("CLOSED");
    }
  }

  private onFailure(): void {
    this.failures++;
    if (this.state === "HALF_OPEN" || this.failures >= this.failureThreshold) {
      this.transitionTo("OPEN");
    }
  }

  private transitionTo(next: CircuitState): void {
    this.state = next;
    this.lastStateChangeAt = Date.now();
    if (next === "OPEN") {
      this.failures = this.failureThreshold; // Prevent counting down below threshold.
    }
    if (next === "CLOSED") {
      this.failures = 0;
    }
  }

  /** Expose metrics for observability / health endpoints. */
  metrics() {
    return {
      name: this.name,
      state: this.state,
      failures: this.failures,
      lastStateChangeAt: new Date(this.lastStateChangeAt).toISOString(),
    };
  }
}

class CircuitOpenError extends Error {
  constructor(providerName: string) {
    super(`Circuit breaker OPEN for AI provider: ${providerName}`);
    this.name = "CircuitOpenError";
  }
}

/** Global registry — one breaker per named AI provider. */
const registry = new Map<string, CircuitBreaker>();

export function getCircuitBreaker(
  providerName: string,
  options?: CircuitBreakerOptions,
): CircuitBreaker {
  if (!registry.has(providerName)) {
    registry.set(providerName, new CircuitBreaker(providerName, options));
  }
  return registry.get(providerName)!;
}

/** Reset a specific breaker (useful in tests). */
function resetCircuitBreaker(providerName: string): void {
  registry.delete(providerName);
}

/** Dump all breaker metrics (for /api/health or admin observability). */
function allCircuitBreakerMetrics() {
  return Array.from(registry.values()).map((cb) => cb.metrics());
}

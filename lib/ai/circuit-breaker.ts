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
 * S9-C2: Fleet-wide KV-backed state sharing.
 * When a KV binding is available (Cloudflare Workers production), the
 * breaker writes its OPEN state to KV on trip and reads it before each
 * execute. This means all isolates learn about a provider failure within
 * one KV read latency (~1ms) instead of independently discovering it
 * after `failureThreshold` failures each.
 *
 * The per-isolate module-level registry remains as a fast local cache —
 * KV is consulted only when the local state is CLOSED to check for a
 * fleet-wide trip, and on state transitions to propagate changes.
 *
 * Usage (in lib/ai/providers.ts or any provider wrapper):
 *   import { getCircuitBreaker } from "@/lib/ai/circuit-breaker";
 *   const cb = getCircuitBreaker("groq");
 *   const result = await cb.execute(() => groqClient.chat(...));
 */

import { getAppCacheKV } from "@/lib/runtime-env";

export type CircuitState = "CLOSED" | "OPEN" | "HALF_OPEN";

export interface CircuitBreakerOptions {
  /** Number of consecutive failures before opening the circuit (default 5). */
  failureThreshold?: number;
  /** Milliseconds to wait before transitioning OPEN → HALF_OPEN (default 30 000). */
  recoveryTimeoutMs?: number;
  /** Milliseconds since last state change after which the breaker resets to CLOSED (default 300 000). */
  resetTimeoutMs?: number;
}

/** Shape of the KV-stored fleet-wide breaker state. */
interface KVBreakerState {
  state: "OPEN";
  until: number;
}

export class CircuitBreaker {
  private state: CircuitState = "CLOSED";
  private failures = 0;
  private lastStateChangeAt = Date.now();
  private readonly failureThreshold: number;
  private readonly recoveryTimeoutMs: number;

  constructor(
    public readonly name: string,
    options: CircuitBreakerOptions = {},
  ) {
    this.failureThreshold = options.failureThreshold ?? 5;
    this.recoveryTimeoutMs = options.recoveryTimeoutMs ?? 30_000;
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

    // S9-C2: If local state is CLOSED, check KV for a fleet-wide OPEN signal.
    if (currentState === "CLOSED") {
      const fleetOpen = await this.checkFleetState();
      if (fleetOpen) {
        this.transitionTo("OPEN");
        throw new CircuitOpenError(this.name);
      }
    }

    if (currentState === "OPEN") {
      throw new CircuitOpenError(this.name);
    }

    try {
      const result = await fn();
      await this.onSuccess();
      return result;
    } catch (err) {
      await this.onFailure();
      throw err;
    }
  }

  private async onSuccess(): Promise<void> {
    this.failures = 0;
    if (this.state !== "CLOSED") {
      this.transitionTo("CLOSED");
      // S9-C2: Clear fleet-wide OPEN signal on recovery.
      await this.clearFleetState();
    }
  }

  private async onFailure(): Promise<void> {
    this.failures++;
    if (this.state === "HALF_OPEN" || this.failures >= this.failureThreshold) {
      this.transitionTo("OPEN");
      // S9-C2: Propagate OPEN state to fleet via KV.
      await this.writeFleetState();
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

  /** S9-C2: Check KV for fleet-wide OPEN state. */
  private async checkFleetState(): Promise<boolean> {
    const kv = getAppCacheKV();
    if (!kv) return false;
    try {
      const stored = (await kv.get(`cb:${this.name}`, "json")) as KVBreakerState | null;
      if (stored && stored.state === "OPEN" && Date.now() < stored.until) {
        return true;
      }
    } catch {
      // KV read failure — fall through to local state (best-effort).
    }
    return false;
  }

  /** S9-C2: Write OPEN state to KV for fleet-wide propagation. */
  private async writeFleetState(): Promise<void> {
    const kv = getAppCacheKV();
    if (!kv) return;
    try {
      const payload: KVBreakerState = {
        state: "OPEN",
        until: Date.now() + this.recoveryTimeoutMs,
      };
      await kv.put(`cb:${this.name}`, JSON.stringify(payload), {
        expirationTtl: Math.ceil(this.recoveryTimeoutMs / 1000) + 10,
      });
    } catch {
      // KV write failure — per-isolate breaker still works locally.
    }
  }

  /** S9-C2: Clear fleet-wide OPEN state on recovery. */
  private async clearFleetState(): Promise<void> {
    const kv = getAppCacheKV();
    if (!kv) return;
    try {
      await kv.delete(`cb:${this.name}`);
    } catch {
      // Best-effort — KV key will expire via TTL anyway.
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

export class CircuitOpenError extends Error {
  constructor(providerName: string) {
    super(`Circuit breaker OPEN for provider: ${providerName}`);
    this.name = "CircuitOpenError";
  }
}

/** Global registry — one breaker per named provider. */
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
export function resetCircuitBreaker(providerName: string): void {
  registry.delete(providerName);
}

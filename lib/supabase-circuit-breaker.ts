/**
 * S3-034 / S3-060: Circuit breaker for Supabase calls.
 *
 * Re-uses the same CircuitBreaker class from lib/ai/circuit-breaker.ts
 * to wrap Supabase operations. When the database is degraded, calls are
 * short-circuited to fail fast instead of piling up timeouts.
 *
 * Usage:
 *   import { supabaseBreaker } from "@/lib/supabase-circuit-breaker";
 *   const data = await supabaseBreaker.execute(() => sb.from("t").select("*"));
 */

import { CircuitBreaker, CircuitOpenError } from "@/lib/ai/circuit-breaker";

export { CircuitOpenError };

export const supabaseBreaker = new CircuitBreaker("supabase", {
  failureThreshold: 5,
  recoveryTimeoutMs: 15_000,
  resetTimeoutMs: 120_000,
});

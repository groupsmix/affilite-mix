/**
 * OF-13: Re-export from the canonical circuit-breaker module.
 *
 * Some consumers reference `@/lib/ai/provider-circuit-breaker`; this
 * file keeps that import path working without duplicating code.
 */
export {
  CircuitBreaker,
  CircuitOpenError,
  getCircuitBreaker,
  resetCircuitBreaker,
  allCircuitBreakerMetrics,
  type CircuitState,
  type CircuitBreakerOptions,
} from "./circuit-breaker";

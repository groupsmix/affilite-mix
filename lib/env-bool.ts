/**
 * SEC-02 (etap-3): Canonical boolean environment-variable parser.
 *
 * The codebase historically parsed boolean env vars three different ways:
 *
 *   1. Strict `=== "true"` (most of `lib/auth.ts`, CSP, idle-timeout)
 *   2. Strict `=== "1"`    (e.g. `CRON_ALLOW_SHARED_FALLBACK_IN_PROD`)
 *   3. Either `"1"` or `"true"` (e.g. `APP_MAINTENANCE_MODE` in middleware.ts)
 *
 * That asymmetry is a footgun: an operator copies a runbook line
 * `ADMIN_SESSION_STRICT=1` (mirroring `APP_MAINTENANCE_MODE=1`) and three
 * independent admin-session defences silently disable themselves because
 * `"1" !== "true"`. There is no startup error and no audit-log entry.
 *
 * `parseBoolEnv` accepts the common spellings (case-insensitive, trimmed):
 *
 *   true:  "1", "true", "yes", "on"
 *   false: "0", "false", "no", "off", ""
 *
 * Anything else returns the fallback and emits a single warning so the
 * misconfiguration is observable. Production deployments should never
 * exercise the fallback path because every operator-facing env var is
 * documented in `.env.example`.
 *
 * Callers should prefer this helper over `process.env.X === "true"` for
 * any boolean control — security flags especially.
 */

const TRUE_VALUES = new Set(["1", "true", "yes", "on"]);
const FALSE_VALUES = new Set(["0", "false", "no", "off", ""]);

/**
 * Read a boolean environment variable.
 *
 * @param name      The env-var name (e.g. `"ADMIN_SESSION_STRICT"`).
 * @param fallback  Value returned when the env var is unset or
 *                  unrecognised. Defaults to `false` so missing config
 *                  fails closed for opt-in controls.
 */
export function parseBoolEnv(name: string, fallback = false): boolean {
  const raw = process.env[name];
  if (raw === undefined) return fallback;

  const lower = raw.trim().toLowerCase();
  if (TRUE_VALUES.has(lower)) return true;
  if (FALSE_VALUES.has(lower)) return false;

  // Unrecognised non-empty value — log and fall back so misconfiguration
  // is observable. We deliberately do NOT throw here: a single typo on a
  // single env var should not crash a worker isolate. We use `console.warn`
  // directly rather than `@/lib/logger` because this helper may be imported
  // at module-init time by other early-load modules, before the logger is
  // safe to construct.
  // eslint-disable-next-line no-console -- FR-06: pre-logger module-init sink (see comment above)
  console.warn(
    `[env-bool] ${name} has unrecognised value ${JSON.stringify(raw)}; falling back to ${fallback}`,
  );
  return fallback;
}

/**
 * Variant that supports tri-state: explicit "true", explicit "false", or
 * "inherit from another env var". Used by per-control admin-session flags
 * where the individual flag can override the umbrella flag.
 *
 * Returns:
 *   - `true`     when `name` parses to true
 *   - `false`    when `name` parses to false (explicitly disabled)
 *   - `null`     when `name` is unset / empty — caller should consult the
 *                umbrella default
 */
export function parseTriBoolEnv(name: string): boolean | null {
  const raw = process.env[name];
  if (raw === undefined) return null;

  const lower = raw.trim().toLowerCase();
  if (lower === "") return null;
  if (TRUE_VALUES.has(lower)) return true;
  if (FALSE_VALUES.has(lower)) return false;

  // eslint-disable-next-line no-console -- FR-06: pre-logger module-init sink (see strictEnvBool)
  console.warn(
    `[env-bool] ${name} has unrecognised value ${JSON.stringify(raw)}; treating as unset`,
  );
  return null;
}

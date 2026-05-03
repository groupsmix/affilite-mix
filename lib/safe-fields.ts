/**
 * Central allowlist enforcer for database inserts and updates.
 *
 * A48.4: Every route that passes user input to Supabase `.insert()` or
 * `.update()` must explicitly pick the allowed fields. This utility
 * prevents mass-assignment / over-posting attacks by stripping any
 * keys not present in the compile-time allowlist.
 *
 * Usage:
 *   const safe = pickFields(body, ["name", "email", "role"] as const);
 *   await sb.from("users").insert(safe);
 *
 * Any extra keys in `body` are silently dropped. If you need to detect
 * extraneous keys (e.g. to return a 400), use `hasExtraFields()`.
 */

/**
 * Pick only the specified keys from `source`, returning a new object
 * that contains nothing else. Keys whose value is `undefined` in source
 * are omitted from the result so Supabase column defaults apply.
 *
 * The `keys` parameter is typed as a `readonly` tuple so the compiler
 * enforces that only known column names are listed at each call site.
 */
export function pickFields<T extends Record<string, unknown>, K extends keyof T & string>(
  source: T,
  keys: readonly K[],
): Pick<T, K> {
  const result = {} as Pick<T, K>;
  for (const key of keys) {
    if (key in source && source[key] !== undefined) {
      result[key] = source[key];
    }
  }
  return result;
}

/**
 * Returns the list of keys present in `source` that are NOT in the
 * `allowedKeys` set. Useful for logging or returning a 400 when
 * unexpected fields are submitted.
 */
export function extraFields<T extends Record<string, unknown>>(
  source: T,
  allowedKeys: readonly string[],
): string[] {
  const allowed = new Set<string>(allowedKeys);
  return Object.keys(source).filter((k) => !allowed.has(k));
}

/**
 * Returns true when `source` contains keys outside the allowlist.
 * Convenience wrapper around `extraFields()`.
 */
export function hasExtraFields<T extends Record<string, unknown>>(
  source: T,
  allowedKeys: readonly string[],
): boolean {
  return extraFields(source, allowedKeys).length > 0;
}

/**
 * Type guard utilities for Supabase query results.
 *
 * Supabase's generated types don't always match our domain types,
 * so we use runtime checks instead of bare `as` casts where practical.
 */

/** Asserts that `value` is a non-null object and returns it typed as T. */
export function assertRow<T extends Record<string, unknown>>(
  value: unknown,
  label: string,
): T {
  if (value === null || value === undefined) {
    throw new Error(`Expected a row (${label}) but got ${String(value)}`);
  }
  if (typeof value !== "object") {
    throw new Error(`Expected an object (${label}) but got ${typeof value}`);
  }
  return value as T;
}

/** Returns value typed as T if non-null, otherwise null. */
export function rowOrNull<T extends Record<string, unknown>>(
  value: unknown,
): T | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "object") return null;
  return value as T;
}

/** Assert an array of rows */
export function assertRows<T extends Record<string, unknown>>(
  value: unknown,
): T[] {
  if (!Array.isArray(value)) return [];
  return value as T[];
}

/** Type guard: checks that value has a specific string property */
export function hasStringProp<K extends string>(
  value: unknown,
  key: K,
): value is Record<K, string> {
  return (
    typeof value === "object" &&
    value !== null &&
    key in value &&
    typeof (value as Record<string, unknown>)[key] === "string"
  );
}

/** Type guard: checks that value has a specific number property */
export function hasNumberProp<K extends string>(
  value: unknown,
  key: K,
): value is Record<K, number> {
  return (
    typeof value === "object" &&
    value !== null &&
    key in value &&
    typeof (value as Record<string, unknown>)[key] === "number"
  );
}

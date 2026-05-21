/**
 * Type guard utilities for Supabase query results.
 *
 * Supabase's generated types don't always match our domain types,
 * so we use runtime checks instead of bare `as` casts where practical.
 */

/** Asserts that `value` is a non-null object with at least an `id` property and returns it typed as T. */
export function assertRow<T>(value: unknown, label: string): T {
  if (value === null || value === undefined) {
    throw new Error(`Expected a row (${label}) but got ${String(value)}`);
  }
  if (typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`Expected an object (${label}) but got ${typeof value}`);
  }
  // Validate that the row has an `id` property (all DB rows have one)
  if (!("id" in value)) {
    throw new Error(`Row (${label}) is missing required 'id' property`);
  }
  return value as T;
}

/** Returns value typed as T if non-null and is a valid object, otherwise null. */
export function rowOrNull<T>(value: unknown): T | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "object" || Array.isArray(value)) return null;
  return value as T;
}

/** Assert an array of rows, filtering out any non-object entries. */
export function assertRows<T>(value: unknown): T[] {
  if (!Array.isArray(value)) return [];
  // Filter out any entries that are not valid row objects
  return value.filter(
    (item): item is T => item !== null && typeof item === "object" && !Array.isArray(item),
  );
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

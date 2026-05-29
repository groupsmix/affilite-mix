/**
 * Type guard utilities for Supabase query results.
 *
 * Supabase's generated types don't always match our domain types,
 * so we use runtime checks instead of bare `as` casts where practical.
 */
// DESIGN: No site_id filtering — pure utility module for Supabase query result type guards.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";

/**
 * Access a Supabase table that is not yet in the generated `Database` type.
 *
 * This replaces the `(sb.from as any)("table_name")` pattern scattered across
 * cron jobs, queues, and privacy routes. The indirection centralises the type
 * escape so that when types are regenerated, only this call site needs updating.
 *
 * The `sb` parameter is typed as `SupabaseClient<Database>` (the full
 * generated schema) rather than `SupabaseClient<any>` so that the F-API-01
 * Proxy brand on `getPrivilegedSupabaseClient()` is preserved across this
 * indirection. The `from(table)` call itself still returns a loosely-typed
 * builder because `table` is a string runtime value, but the *client* itself
 * carries the full type and proxy guard.
 */
export function untypedFrom(sb: SupabaseClient<Database>, table: string) {
  // The supabase-js builder is typed against `keyof Database['public']['Tables']`,
  // but the entire purpose of this helper is to access tables that are *not*
  // yet in the generated `Database` type. We therefore widen the *client* type
  // (via a one-line cast) before calling `.from(table)`. The cast is contained
  // to this single line, and the *parameter* is still typed against the full
  // `SupabaseClient<Database>` so callers can't sneak in a different generic
  // (e.g. an unbranded raw client that bypasses the F-API-01 Proxy).
  return (sb as unknown as SupabaseClient).from(table);
}

/**
 * Call a Supabase RPC function that is not yet in the generated `Database` type.
 * Same rationale as `untypedFrom` — centralises the escape hatch.
 */
export function untypedRpc(
  sb: SupabaseClient<Database>,
  fn: string,
  args?: Record<string, unknown>,
) {
  // Same containment as `untypedFrom`: widen the client once at the entry,
  // not the function name string.
  return (sb as unknown as SupabaseClient).rpc(fn, args);
}

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

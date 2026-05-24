/** Nil UUID — must not be accepted as a real resource identifier (audit ID-005). */
export const NIL_UUID = "00000000-0000-0000-0000-000000000000";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** RFC 4122 string shape only (does not reject nil UUID). */
export function isUuidFormat(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}

/** Valid non-nil UUID suitable for DB lookups and optimistic locks. */
export function isUsableUuid(value: unknown): value is string {
  return isUuidFormat(value) && value.toLowerCase() !== NIL_UUID;
}

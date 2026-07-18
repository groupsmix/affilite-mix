/**
 * Idempotency helpers for autonomous mutations (plan §13).
 *
 * Every mutation carries an `Idempotency-Key`. Reusing a key with the SAME
 * payload must return the original result; reusing it with a DIFFERENT
 * payload is a conflict. We compare a stable SHA-256 hash of the payload so
 * key/payload agreement is decided deterministically.
 */

/** Deterministically stringify a JSON value with sorted object keys. */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(obj).sort()) {
      out[key] = sortKeys(obj[key]);
    }
    return out;
  }
  return value;
}

/** SHA-256 (hex) of the canonical JSON encoding of `payload`. */
export async function payloadHash(payload: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(canonicalJson(payload));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export type IdempotencyOutcome<T> =
  | { kind: "fresh" }
  | { kind: "replay"; existing: T }
  | { kind: "conflict" };

/**
 * Decide how to treat an incoming request given any existing action found by
 * `(service_account_id, idempotency_key)`.
 *
 * - no existing row               -> fresh (proceed)
 * - existing, same payload hash    -> replay (return the original)
 * - existing, different payload    -> conflict (reject)
 */
export function classifyIdempotency<T extends { payload_hash: string }>(
  existing: T | null,
  incomingHash: string,
): IdempotencyOutcome<T> {
  if (!existing) return { kind: "fresh" };
  if (existing.payload_hash === incomingHash) return { kind: "replay", existing };
  return { kind: "conflict" };
}

/** RFC-4122 UUID matcher used to validate a caller-supplied key format. */
const KEY_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,254}$/;

/** True when the idempotency key has an acceptable shape (8–255 chars). */
export function isValidIdempotencyKey(key: string): boolean {
  return KEY_RE.test(key);
}

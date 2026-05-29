/**
 * Password hashing using bcrypt (via bcryptjs for Cloudflare Workers compatibility).
 *
 * New passwords are hashed with bcrypt (cost factor 10). Legacy hashes are
 * still verified for backwards compatibility, but verifyPassword signals when
 * a rehash is needed so callers can upgrade hashes on next successful login:
 *
 *   - PBKDF2-SHA256 hashes in the legacy "salt:hash" format, and
 *   - bcrypt hashes that were stored with fewer rounds than BCRYPT_ROUNDS.
 *
 * G-50: Cost-factor trade-off on Cloudflare Workers.
 *   Pure-JS bcryptjs at cost 12 takes ~800-1100ms per verify on a Worker
 *   isolate, which both eats the 30s CPU budget under burst and acts as a
 *   self-DoS amplifier. We run at cost 10 (~200-300ms) and compensate with
 *   a tighter per-IP rate limit (see app/api/auth/login/route.ts). OWASP
 *   treats cost 10 as the acceptable floor for bcrypt; stronger brute-force
 *   resistance comes from Turnstile + per-email + per-IP throttling, not
 *   from burning Worker CPU on each attempt.
 */

import bcrypt from "bcryptjs";

const BCRYPT_ROUNDS = 10;

// ── Legacy PBKDF2 helpers (read-only, for migrating existing hashes) ────

const PBKDF2_ITERATIONS = 100_000;
const PBKDF2_KEY_LENGTH = 32; // bytes

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function fromHex(hex: string): Uint8Array {
  const pairs = hex.match(/.{1,2}/g) ?? [];
  return new Uint8Array(pairs.map((b) => parseInt(b, 16)));
}

async function pbkdf2DeriveKey(password: string, salt: Uint8Array): Promise<ArrayBuffer> {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );

  return crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt,
      iterations: PBKDF2_ITERATIONS,
      hash: "SHA-256",
    },
    keyMaterial,
    PBKDF2_KEY_LENGTH * 8,
  );
}

/** Verify a password against a legacy PBKDF2 "salt:hash" string */
async function verifyPbkdf2(password: string, storedHash: string): Promise<boolean> {
  const [saltHex, hashHex] = storedHash.split(":");
  if (!saltHex || !hashHex) return false;

  const salt = fromHex(saltHex);
  const derived = await pbkdf2DeriveKey(password, salt);
  const derivedHex = toHex(derived);

  // Constant-time comparison
  if (derivedHex.length !== hashHex.length) return false;
  let result = 0;
  for (let i = 0; i < derivedHex.length; i++) {
    result |= derivedHex.charCodeAt(i) ^ hashHex.charCodeAt(i);
  }
  return result === 0;
}

// ── Public API ──────────────────────────────────────────────────────────

/** Detect whether a stored hash is a legacy PBKDF2 format ("hex:hex") */
function isLegacyHash(storedHash: string): boolean {
  return !storedHash.startsWith("$2") && storedHash.includes(":");
}

/** True when a bcrypt hash was stored with fewer rounds than BCRYPT_ROUNDS. */
function bcryptNeedsRehash(storedHash: string): boolean {
  try {
    return bcrypt.getRounds(storedHash) < BCRYPT_ROUNDS;
  } catch {
    // fail-safe: skip rehash on parse error [criticality:non-critical]
    return false;
  }
}

/** Hash a password using bcrypt and return a storable string */
export async function hashPassword(password: string): Promise<string> {
  if (new TextEncoder().encode(password).byteLength > 72) {
    throw new Error("Password too long (>72 bytes after UTF-8 encode)");
  }
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

export interface VerifyResult {
  valid: boolean;
  /**
   * True when the stored hash should be upgraded — either a legacy PBKDF2
   * hash, or a bcrypt hash stored with fewer rounds than the current
   * `BCRYPT_ROUNDS`.
   */
  needsRehash: boolean;
}

/**
 * Verify a password against a stored hash.
 *
 * Supports both bcrypt hashes (preferred) and legacy PBKDF2 "salt:hash" strings.
 * `needsRehash` is set to `true` when the stored hash should be upgraded —
 * either a legacy PBKDF2 hash, or a bcrypt hash stored with fewer rounds than
 * the current `BCRYPT_ROUNDS` — so the caller can re-hash and persist the
 * upgraded bcrypt hash on the next successful login.
 */
export async function verifyPassword(password: string, storedHash: string): Promise<VerifyResult> {
  if (!storedHash) return { valid: false, needsRehash: false };

  if (new TextEncoder().encode(password).byteLength > 72) {
    return { valid: false, needsRehash: false };
  }

  if (isLegacyHash(storedHash)) {
    const valid = await verifyPbkdf2(password, storedHash);
    return { valid, needsRehash: valid };
  }

  const valid = await bcrypt.compare(password, storedHash);
  return { valid, needsRehash: valid && bcryptNeedsRehash(storedHash) };
}

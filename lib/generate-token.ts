/**
 * Generate a high-entropy, URL-safe secret token with a prefix.
 *
 * Uses `crypto.getRandomValues` (Edge/Worker-safe) instead of Node's
 * `randomBytes` so this can run in either Next.js server runtime.
 */
export function generateSecretToken(prefix: string, byteLength = 32): string {
  const bytes = new Uint8Array(byteLength);
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    crypto.getRandomValues(bytes);
  } else {
    // Fallback: crypto.getRandomValues is available in every modern runtime
    // this project targets, but throw a clear error if it ever isn't.
    throw new Error("crypto.getRandomValues is not available");
  }

  const base64 = btoa(String.fromCharCode(...bytes));
  const base64url = base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
  return `${prefix}_${base64url}`;
}

/** SHA-256 hash of a token, hex-encoded, for secure storage. */
export async function hashSecretToken(token: string): Promise<string> {
  const bytes = new TextEncoder().encode(token);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

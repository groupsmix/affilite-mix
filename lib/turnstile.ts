/**
 * Cloudflare Turnstile server-side verification.
 *
 * Validates the Turnstile token sent from the client against
 * Cloudflare's siteverify endpoint.
 *
 * Requires TURNSTILE_SECRET_KEY env var in production.
 * In development, verification is skipped if the secret is not set.
 */

const VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

interface TurnstileVerifyResponse {
  success: boolean;
  "error-codes"?: string[];
  challenge_ts?: string;
  hostname?: string;
}

/**
 * Verify a Turnstile token server-side.
 * Returns true if the token is valid, or if Turnstile is not configured (dev).
 */
export async function verifyTurnstileToken(
  token: string | null | undefined,
  remoteIp?: string,
): Promise<{ success: boolean; error?: string }> {
  const secret = process.env.TURNSTILE_SECRET_KEY;

  // Skip verification in dev when not configured
  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      return { success: false, error: "Turnstile not configured" };
    }
    return { success: true };
  }

  if (!token) {
    return { success: false, error: "Missing Turnstile token" };
  }

  const body = new URLSearchParams({
    secret,
    response: token,
    ...(remoteIp ? { remoteip: remoteIp } : {}),
  });

  const res = await fetch(VERIFY_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  const data = (await res.json()) as TurnstileVerifyResponse;

  if (!data.success) {
    return {
      success: false,
      error: data["error-codes"]?.join(", ") ?? "Turnstile verification failed",
    };
  }

  return { success: true };
}

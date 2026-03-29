/**
 * Server-side Cloudflare Turnstile verification.
 *
 * In development (when TURNSTILE_SECRET_KEY is not set), verification is
 * skipped to avoid blocking local testing. In production the secret key
 * is required and verification failures reject the request.
 */

const VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export interface TurnstileResult {
  success: boolean;
  error?: string;
}

/**
 * Verify a Turnstile token received from the client.
 * Returns { success: true } when the token is valid or when Turnstile is
 * not configured (dev mode). Returns { success: false, error } otherwise.
 */
export async function verifyTurnstile(
  token: string | null | undefined,
  ip?: string,
): Promise<TurnstileResult> {
  const secretKey = process.env.TURNSTILE_SECRET_KEY;

  // Skip verification in dev when key is not configured
  if (!secretKey) {
    if (process.env.NODE_ENV === "production") {
      return { success: false, error: "Turnstile is not configured" };
    }
    return { success: true };
  }

  if (!token) {
    return { success: false, error: "Missing captcha token" };
  }

  try {
    const body = new URLSearchParams({
      secret: secretKey,
      response: token,
    });
    if (ip) {
      body.set("remoteip", ip);
    }

    const res = await fetch(VERIFY_URL, {
      method: "POST",
      body,
    });

    const data = (await res.json()) as { success: boolean; "error-codes"?: string[] };

    if (!data.success) {
      return {
        success: false,
        error: `Captcha verification failed: ${(data["error-codes"] ?? []).join(", ")}`,
      };
    }

    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Turnstile verification failed";
    return { success: false, error: message };
  }
}

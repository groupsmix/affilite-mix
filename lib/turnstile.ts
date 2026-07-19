import { fetchWithTimeout } from "@/lib/fetch-timeout";
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
  // RISK-16: Turnstile defaults to ON in production. Explicitly set
  // ENABLE_TURNSTILE=false to opt out (e.g. local dev, CI).
  const isProduction = process.env.NODE_ENV === "production";
  const envVal = process.env.ENABLE_TURNSTILE;
  const enableTurnstile =
    envVal === "true" || envVal === "1" || (isProduction && envVal !== "false" && envVal !== "0");

  if (!enableTurnstile) {
    return { success: true };
  }

  const secretKey = process.env.TURNSTILE_SECRET_KEY;

  // When Turnstile is enabled but key is missing, fail in production
  if (!secretKey) {
    if (process.env.NODE_ENV === "production") {
      return {
        success: false,
        error: "Turnstile is enabled but TURNSTILE_SECRET_KEY is not configured",
      };
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

    const res = await fetchWithTimeout(VERIFY_URL, {
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

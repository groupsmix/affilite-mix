import { NextRequest, NextResponse } from "next/server";
import {
  authenticateUser,
  createToken,
  COOKIE_NAME,
  getAdminBindingCookie,
  touchAdminActivity,
} from "@/lib/auth";
import { computeRequestBinding } from "@/lib/jwt-binding";
import { checkRateLimit } from "@/lib/rate-limit";
import { verifyTurnstile } from "@/lib/turnstile";
import { getClientIp } from "@/lib/get-client-ip";
import {
  isValidEmail,
  normalizeEmail,
  hashEmailForRateLimit,
  sanitizeEmailInput,
  MAX_EMAIL_LENGTH,
} from "@/lib/validate-email";
import { apiError, rateLimitHeaders, parseJsonBody } from "@/lib/api-error";
import { captureException } from "@/lib/sentry";
import { IS_SECURE_COOKIE } from "@/lib/cookie-utils";
import { ACTIVITY_COOKIE, BINDING_COOKIE } from "@/lib/auth";
import { logger } from "@/lib/logger";
import {
  getAdminUserByEmail,
  updateAdminUser,
  incrementLoginFailedAttempts,
} from "@/lib/dal/admin-users";
import { verifyTotpToken } from "@/lib/totp";
import { decryptTotpSecret } from "@/lib/totp-encryption";
import { validateNotDisposable } from "@/lib/security/disposable-email";
import { recordAuditEvent } from "@/lib/audit-log";

/**
 * A154: Check if a password has appeared in a known data breach using the
 * HIBP k-anonymity API (https://haveibeenpwned.com/API/v3#SearchingPwnedPasswordsByRange).
 * Sends only the first 5 characters of the SHA-1 hash — the full password
 * and even its complete hash never leave this process.
 *
 * Returns true if the password appears in the breach database.
 * On network error, returns false (fail-open) to avoid blocking legitimate logins.
 */
async function isBreachedPassword(password: string): Promise<boolean> {
  try {
    // SHA-1 of the password, upper-cased hex
    const encoder = new TextEncoder();
    const hashBuffer = await crypto.subtle.digest("SHA-1", encoder.encode(password));
    const hashHex = Array.from(new Uint8Array(hashBuffer))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("")
      .toUpperCase();

    const prefix = hashHex.slice(0, 5);
    const suffix = hashHex.slice(5);

    const res = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`, {
      headers: { "Add-Padding": "true" }, // k-anon padding
      signal: AbortSignal.timeout(3000),
    });

    if (!res.ok) return false;

    const text = await res.text();
    // Each line is "SUFFIX:COUNT"
    return text.split("\n").some((line) => line.toUpperCase().startsWith(suffix));
  } catch {
    // Fail-open: network error or timeout — don't block logins
    return false;
  }
}

/**
 * SECURITY-FIX: Global rate limit for all login attempts across all IPs (D3-001 / CWE-400).
 * Prevents distributed bcrypt CPU exhaustion: 1000 IPs x 3/15min = 3000 bcrypt ops.
 * Cap at 100 login attempts per minute globally to bound total CPU spend.
 */
function parsePositiveIntEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw == null || raw === "") return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/** Configurable via LOGIN_RATE_LIMIT_GLOBAL_MAX (audit P7-002 / F10-002). */
const LOGIN_RATE_LIMIT_GLOBAL = {
  maxRequests: parsePositiveIntEnv("LOGIN_RATE_LIMIT_GLOBAL_MAX", 100),
  windowMs: 60 * 1000,
  failPolicy: "closed" as const,
};

/**
 * G-50: 3 login attempts per 15 minutes per IP.
 * Tightened from 5/15min after dropping bcrypt to cost-10, so the per-IP
 * guess budget stays roughly equivalent to the old cost-12 setup.
 */
const LOGIN_RATE_LIMIT_IP = {
  maxRequests: 3,
  windowMs: 15 * 60 * 1000,
  failPolicy: "closed" as const,
};

/** 10 login attempts per 15 minutes per email (prevents brute-force from rotating IPs) */
const LOGIN_RATE_LIMIT_EMAIL = {
  maxRequests: 10,
  windowMs: 15 * 60 * 1000,
  failPolicy: "closed" as const,
};

export async function POST(request: NextRequest) {
  // F-FE-01: Fail fast if critical env vars are missing at runtime.
  // Checked at request time (not module load) to avoid build-time failures.
  // Only enforced in production — dev/test uses a random fallback via lib/jwt-secret.ts.
  if (
    process.env.NODE_ENV === "production" &&
    !process.env.JWT_SECRET &&
    !process.env.JWT_SECRET_CURRENT
  ) {
    return apiError(500, "Server configuration error: JWT signing key not available");
  }

  try {
    // SECURITY-FIX: Global rate limit to prevent distributed bcrypt CPU exhaustion (D3-001)
    const globalRl = await checkRateLimit("login:global", LOGIN_RATE_LIMIT_GLOBAL);
    if (!globalRl.allowed) {
      return apiError(429, "Too many login attempts. Try again later.", undefined, {
        "Retry-After": String(Math.ceil(globalRl.retryAfterMs / 1000)),
        ...rateLimitHeaders(LOGIN_RATE_LIMIT_GLOBAL, globalRl),
      });
    }

    const ip = getClientIp(request);
    const rl = await checkRateLimit(`login:${ip}`, LOGIN_RATE_LIMIT_IP);
    if (!rl.allowed) {
      return apiError(429, "Too many login attempts. Try again later.", undefined, {
        "Retry-After": String(Math.ceil(rl.retryAfterMs / 1000)),
        ...rateLimitHeaders(LOGIN_RATE_LIMIT_IP, rl),
      });
    }

    const bodyOrError = await parseJsonBody(request);
    if (bodyOrError instanceof NextResponse) return bodyOrError;
    const {
      email: rawEmail,
      password,
      turnstileToken,
      totp_token,
    } = bodyOrError as {
      email?: string;
      password?: string;
      turnstileToken?: string;
      totp_token?: string;
    };
    const email = typeof rawEmail === "string" ? sanitizeEmailInput(rawEmail) : rawEmail;

    // Verify Turnstile token (skipped in dev if not configured)
    const turnstileResult = await verifyTurnstile(turnstileToken, ip);
    if (!turnstileResult.success) {
      return apiError(403, turnstileResult.error ?? "Captcha verification failed");
    }

    // SECURITY-FIX: RFC 5321 length cap + null-byte strip (IV-001 / CWE-1284)
    if (email && email.length > MAX_EMAIL_LENGTH) {
      return apiError(400, "Email exceeds maximum length");
    }

    if (!email || !isValidEmail(email)) {
      return apiError(400, "Valid email is required");
    }

    if (!password) {
      return apiError(400, "password is required");
    }

    // SECURITY-FIX: Length limit on password before bcrypt (V14-005 / CWE-1284)
    // Bcrypt truncates at 72 bytes; anything longer wastes CPU parsing the body.
    if (password.length > 128) {
      return apiError(400, "Password exceeds maximum length");
    }

    // A153: Block disposable / throwaway email addresses on the admin login path too
    // (prevents fake admin account creation via disposable addresses)
    const disposableError = validateNotDisposable(normalizeEmail(email) || email);
    if (disposableError) {
      return apiError(400, disposableError);
    }

    // Per-email rate limiting — prevents brute-force from rotating IPs
    // F-032 + F-007: Strip '+' alias tags and hash email to prevent rate-limit
    // bypass and avoid PII in operational metadata (KV keys, logs, dashboards).
    const rateLimitEmail = await hashEmailForRateLimit(email);

    const emailRl = await checkRateLimit(`login-email:${rateLimitEmail}`, LOGIN_RATE_LIMIT_EMAIL);
    if (!emailRl.allowed) {
      return apiError(
        429,
        "Too many login attempts for this account. Try again later.",
        undefined,
        {
          "Retry-After": String(Math.ceil(emailRl.retryAfterMs / 1000)),
          ...rateLimitHeaders(LOGIN_RATE_LIMIT_EMAIL, emailRl),
        },
      );
    }

    const userRecord = await getAdminUserByEmail(email);
    if (userRecord?.login_locked_until && new Date(userRecord.login_locked_until) > new Date()) {
      return apiError(
        423,
        "Account temporarily locked due to too many failed login attempts. Please try again later.",
      );
    }

    const authResult = await authenticateUser(email, password);
    if (!authResult) {
      if (userRecord) {
        // SECURITY-FIX: Use atomic increment to prevent race condition (R10-004 / CWE-362)
        try {
          await incrementLoginFailedAttempts(userRecord.id, 10, 60 * 60 * 1000);
        } catch (e: any) {
          // Ignore missing column errors if the 00096 migration hasn't run yet
          if (e.code !== "42703") {
            logger.error("Failed to update admin user lockout", { error: e });
          }
        }
      }
      // FP-09: forensic trail — record failed login attempts with IP and
      // hashed email so SOC can correlate attacker IPs across accounts.
      try {
        await recordAuditEvent({
          site_id: "_global",
          actor: rateLimitEmail,
          action: "auth.login.failed",
          entity_type: "admin_user",
          entity_id: userRecord?.id ?? "unknown",
          ip,
          details: {
            email_hash: rateLimitEmail,
            user_known: Boolean(userRecord),
          },
        });
      } catch (auditErr) {
        logger.warn("Failed to record audit event for failed login", { error: auditErr });
      }
      return apiError(401, "Invalid credentials");
    }

    if (userRecord && (userRecord.login_failed_attempts > 0 || userRecord.login_locked_until)) {
      try {
        await updateAdminUser(userRecord.id, {
          login_failed_attempts: 0,
          login_locked_until: null,
        });
      } catch (e: any) {
        if (e.code !== "42703") {
          logger.error("Failed to reset admin user lockout", { error: e });
        }
      }
    }

    // A154: Advisory HIBP k-anon breached-password check.
    // We check AFTER successful authentication so the HIBP API only sees a
    // prefix of the SHA-1 hash of the correct password — never a wrong guess.
    // Fail-open (network errors don't block login); warn in response body only.
    let passwordBreached = false;
    try {
      passwordBreached = await isBreachedPassword(password);
    } catch {
      // fail-open
    }

    // Enforce TOTP 2FA if enabled on the account
    if (authResult.email) {
      const user = await getAdminUserByEmail(authResult.email);

      // F-017: Enforce TOTP for super_admin roles
      if (user?.role === "super_admin" && !user?.totp_enabled) {
        return apiError(
          403,
          "Super Admins must have TOTP enabled. Please contact support to provision 2FA.",
        );
      }

      if (user?.totp_enabled) {
        // R9: Account-level TOTP lock
        if (user.totp_locked_until && new Date(user.totp_locked_until) > new Date()) {
          return apiError(
            423,
            "Account temporarily locked due to too many failed 2FA attempts. Please contact another administrator or try again later.",
          );
        }

        if (!totp_token) {
          // AUDIT-FIX A3-004: Return a generic challenge state that does NOT
          // reveal whether the account has 2FA enrolled. The UI can prompt
          // for a TOTP code without the response body confirming enrollment.
          return NextResponse.json(
            { challenge: "2fa_required" },
            { status: 202, headers: rateLimitHeaders(LOGIN_RATE_LIMIT_IP, rl) },
          );
        }
        // Separate tight rate limit for TOTP brute-forcing (5 attempts per 5 mins per email)
        const totpLimit = {
          maxRequests: 5,
          windowMs: 5 * 60 * 1000,
          failPolicy: "closed" as const,
        };
        const totpRl = await checkRateLimit(`login-totp:${rateLimitEmail}`, totpLimit);

        if (!totpRl.allowed) {
          return apiError(429, "Too many 2FA attempts. Please try again later.", undefined, {
            "Retry-After": String(Math.ceil(totpRl.retryAfterMs / 1000)),
            ...rateLimitHeaders(totpLimit, totpRl),
          });
        }

        if (
          typeof totp_token !== "string" ||
          totp_token.length !== 6 ||
          !user.totp_secret ||
          // B-01: Decrypt TOTP secret before verification
          !verifyTotpToken(await decryptTotpSecret(user.totp_secret), totp_token)
        ) {
          // Increment failed attempts and lock if >= 10
          const attempts = (user.totp_failed_attempts || 0) + 1;
          const updates: { totp_failed_attempts: number; totp_locked_until?: string } = {
            totp_failed_attempts: attempts,
          };
          if (attempts >= 10) {
            // Lock for 1 hour
            updates.totp_locked_until = new Date(Date.now() + 60 * 60 * 1000).toISOString();
          }
          await updateAdminUser(user.id, updates);
          return apiError(401, "Invalid 2FA token");
        }

        // Reset failed attempts on success
        if (user.totp_failed_attempts > 0 || user.totp_locked_until) {
          await updateAdminUser(user.id, { totp_failed_attempts: 0, totp_locked_until: null });
        }
      }
    }

    // F-035: bind the token to the originating user-agent + IP /24.
    const token = await createToken(authResult, request);

    const response = NextResponse.json(
      {
        ok: true,
        // A154: Advisory flag — if true, prompt the user to change their password.
        // Does NOT block login; the UI should show a security notice.
        ...(passwordBreached ? { password_breached: true } : {}),
      },
      {
        headers: rateLimitHeaders(LOGIN_RATE_LIMIT_IP, rl),
      },
    );
    // A7-05: Explicitly delete any pre-existing session cookies before setting
    // the new ones.  This prevents session fixation: if a pre-login cookie was
    // somehow planted (e.g. via subdomain cookie injection), deleting it here
    // ensures the authenticated session always starts from a clean slate.
    response.cookies.delete(COOKIE_NAME);
    response.cookies.delete(ACTIVITY_COOKIE);
    response.cookies.delete(BINDING_COOKIE);

    response.cookies.set(COOKIE_NAME, token, {
      httpOnly: true,
      secure: IS_SECURE_COOKIE,
      sameSite: "strict",
      path: "/",
      maxAge: 60 * 60 * 4, // 4 hours (matches JWT expiry)
    });

    // A-012: set a separate binding cookie so the JWT cannot be replayed
    // without the corresponding binding fingerprint.
    // Pass authResult.role so super_admin gets /32 binding (matching createToken).
    const binding = await computeRequestBinding(request, authResult.role);
    if (binding) {
      const bc = getAdminBindingCookie(binding);
      response.cookies.set(
        bc.name,
        bc.value,
        bc.options as Parameters<NextResponse["cookies"]["set"]>[2],
      );
    }

    // P0-1: Write the activity cookie at login so idle-timeout enforcement
    // has an initial timestamp from the very first request.
    const activity = await touchAdminActivity();
    response.cookies.set(
      activity.name,
      activity.value,
      activity.options as Parameters<NextResponse["cookies"]["set"]>[2],
    );

    return response;
  } catch (err) {
    captureException(err, { context: "[api/auth/login] POST failed:" });
    return apiError(500, "Internal server error");
  }
}

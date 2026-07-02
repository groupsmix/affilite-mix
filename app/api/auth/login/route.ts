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
  incrementTotpFailedAttempts,
  verifyAndSetTotpStep,
} from "@/lib/dal/admin-users";
import { getPrivilegedSupabaseClient } from "@/lib/server-only/service-role"; // nosemgrep: service-role-import
import { verifyTotpToken, needsSha256Reenrollment, isSha1TotpPastDeadline } from "@/lib/totp";
import { decryptTotpSecret } from "@/lib/totp-encryption";
import { validateNotDisposable } from "@/lib/security/disposable-email";
import { recordAuditEvent } from "@/lib/audit-log";
import { checkSuspiciousLogin } from "@/lib/suspicious-login";
import { getAppCacheKV } from "@/lib/runtime-env";
import {
  MAX_SESSION_AGE_REGULAR_SECONDS,
  MAX_SESSION_AGE_ADMIN_SECONDS,
  ADMIN_JWT_EXPIRY_SECONDS,
} from "@/lib/auth-constants";

/**
 * P1-4 / P1-6: KV cache TTL for HIBP range responses (in seconds).
 * 24h matches HIBP's own rotation cadence and keeps stable suffixes warm
 * without becoming a long-term staleness liability for newly-leaked
 * passwords. Tunable via env for incident-time invalidation.
 */
function hibpCacheTtlSeconds(): number {
  const raw = process.env.HIBP_CACHE_TTL_SECONDS;
  if (raw) {
    const n = Number.parseInt(raw, 10);
    if (Number.isFinite(n) && n > 0 && n <= 7 * 24 * 60 * 60) return n;
  }
  return 24 * 60 * 60;
}

/**
 * A154 / P1-4 / P1-6: Check if a password has appeared in a known data breach using the
 * HIBP k-anonymity API (https://haveibeenpwned.com/API/v3#SearchingPwnedPasswordsByRange).
 * Sends only the first 5 characters of the SHA-1 hash — the full password
 * and even its complete hash never leave this process.
 *
 * Cache strategy (P1-4 / P1-6):
 * - The prefix→suffix list is stored in APP_CACHE_KV under `hibp:<prefix>`
 *   with a 24h TTL. Repeat lookups (same prefix from any concurrent login)
 *   skip the external API entirely, bounding the upstream traffic to one
 *   request per prefix per TTL window regardless of login volume.
 * - HIBP padded responses are ~16-40KB so KV-storage cost is well within
 *   limits; the size cap stays at 2 MiB as a defence-in-depth bound.
 *
 * Failure mode (P1-4 + SEC-HIGH-03):
 * - Returns `false` (fail-open) on network error so a transient HIBP
 *   outage doesn't lock legitimate logins out. Each fail-open path emits
 *   a Sentry capture so operators see signal during sustained outages.
 *
 * Returns true if the password appears in the breach database.
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

    // P1-4 / P1-6: KV-cached prefix→suffix list. Per HIBP terms, this is
    // public data so caching does not weaken k-anonymity.
    const kv = getAppCacheKV();
    const cacheKey = `hibp:${prefix}`;
    if (kv) {
      try {
        const cached = await kv.get(cacheKey);
        if (typeof cached === "string" && cached.length > 0) {
          return cached.split("\n").some((line) => line.toUpperCase().startsWith(suffix));
        }
      } catch (e: unknown) {
        // KV read failure should not block the live HIBP fetch
        captureException(e, { tag: "hibp:cache-read" });
      }
    }

    const res = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`, {
      headers: { "Add-Padding": "true" }, // k-anon padding
      signal: AbortSignal.timeout(3000),
    });

    if (!res.ok) {
      captureException(new Error(`HIBP non-OK response: ${res.status}`), {
        tag: "hibp:non-ok",
        status: res.status,
      });
      return false;
    }

    // RC-005: Stream response with hard size cap — abort before buffering if too large.
    // Prevents a hostile proxy/dependency from causing memory pressure.
    const maxBytes = 2 * 1024 * 1024;
    const contentLen = Number(res.headers.get("content-length") ?? "0");
    if (contentLen > maxBytes) {
      captureException(new Error("HIBP response exceeded size cap"), {
        tag: "hibp:size-cap",
        contentLen,
      });
      return false;
    }

    const reader = res.body?.getReader();
    if (!reader) return false;
    const chunks: Uint8Array[] = [];
    let received = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.length;
      if (received > maxBytes) {
        await reader.cancel();
        captureException(new Error("HIBP response exceeded size cap (streaming)"), {
          tag: "hibp:size-cap-stream",
          received,
        });
        return false;
      }
      chunks.push(value);
    }
    const text = new TextDecoder().decode(chunks.length === 1 ? chunks[0] : Buffer.concat(chunks));

    // Write-through to KV (best-effort, never block on failure)
    if (kv) {
      try {
        await kv.put(cacheKey, text, { expirationTtl: hibpCacheTtlSeconds() });
      } catch (e: unknown) {
        captureException(e, { tag: "hibp:cache-write" });
      }
    }

    return text.split("\n").some((line) => line.toUpperCase().startsWith(suffix));
  } catch (e: unknown) {
    // P1-4: fail-open on network/timeout, but emit Sentry signal so
    // sustained HIBP outages are operationally visible.
    captureException(e, { tag: "hibp:fail-open" });
    return false;
  }
}

/**
 * SECURITY-FIX: Global rate limit for all login attempts across all IPs (D3-001 / CWE-400).
 * Prevents distributed bcrypt CPU exhaustion: 1000 IPs x 3/15min = 3000 bcrypt ops.
 * Cap at 100 login attempts per minute globally to bound total CPU spend.
 */
function parsePositiveIntEnv(name: string, fallback: number, ceiling?: number): number {
  const raw = process.env[name];
  if (raw == null || raw === "") return fallback;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  // audit-etap1 #11: cap operator-configurable rate-limit ceilings so a leaked
  // staging .env or a hostile deploy override cannot raise the cap to a
  // pathological value (e.g. 2_147_483_647) and silently disable the global
  // brute-force protection. We log a warning once on cold start so the
  // misconfiguration is visible in deployment logs.
  if (ceiling !== undefined && n > ceiling) {
    logger.warn(`${name} value exceeds ceiling; clamping to defend bcrypt CPU budget`, {
      configured: n,
      ceiling,
      name,
    });
    return ceiling;
  }
  return n;
}

/**
 * Configurable via LOGIN_RATE_LIMIT_GLOBAL_MAX (audit P7-002 / F10-002).
 * Capped at 1000/min by audit-etap1 #11: any higher cap effectively disables
 * the global brute-force protection while staying below INT_MAX, which means
 * a typo cannot be detected by Number.isFinite alone.
 */
const LOGIN_RATE_LIMIT_GLOBAL_MAX_CEILING = 1000;
const LOGIN_RATE_LIMIT_GLOBAL = {
  maxRequests: parsePositiveIntEnv(
    "LOGIN_RATE_LIMIT_GLOBAL_MAX",
    100,
    LOGIN_RATE_LIMIT_GLOBAL_MAX_CEILING,
  ),
  windowMs: 60 * 1000,
  failPolicy: "closed" as const,
  graceMs: 0,
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
  graceMs: 0,
};

/** 10 login attempts per 15 minutes per email (prevents brute-force from rotating IPs) */
const LOGIN_RATE_LIMIT_EMAIL = {
  maxRequests: 10,
  windowMs: 15 * 60 * 1000,
  failPolicy: "closed" as const,
  graceMs: 0,
};

export async function POST(request: NextRequest) {
  const requestId = request.headers.get("x-trace-id") ?? crypto.randomUUID();
  const log = logger.child({ requestId });

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
    // OPS: temporary kill switch via LOGIN_RATE_LIMIT_GLOBAL_DISABLED=true.
    // Use during incidents when the underlying limiter (DO/KV) is failing-closed.
    // Per-IP (3/15min) and per-email (10/15min) limits still apply.
    if (process.env.LOGIN_RATE_LIMIT_GLOBAL_DISABLED !== "true") {
      const globalRl = await checkRateLimit("login:global", LOGIN_RATE_LIMIT_GLOBAL);
      if (!globalRl.allowed) {
        return apiError(429, "Too many login attempts. Try again later.", undefined, {
          "Retry-After": String(Math.ceil(globalRl.retryAfterMs / 1000)),
          ...rateLimitHeaders(LOGIN_RATE_LIMIT_GLOBAL, globalRl),
        });
      }
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
      totp_token,
    } = bodyOrError as {
      email?: string;
      password?: string;
      totp_token?: string;
    };
    const email = typeof rawEmail === "string" ? sanitizeEmailInput(rawEmail) : rawEmail;

    // SECURITY-FIX: RFC 5321 length cap + null-byte strip (IV-001 / CWE-1284)
    if (email && email.length > MAX_EMAIL_LENGTH) {
      return apiError(400, "Email exceeds maximum length");
    }

    if (!email || !isValidEmail(email)) {
      return apiError(400, "Valid email is required");
    }

    // AUDIT-FIX A4-006: Explicit type check to reject non-string payloads
    if (typeof password !== "string" || !password) {
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

    const userRecord = await getAdminUserByEmail(email, () =>
      getPrivilegedSupabaseClient("login:lockout-check"),
    );
    // A96-3: Use >= so the account stays locked for the full duration
    // (previously unlocked one tick early at the exact boundary).
    if (userRecord?.login_locked_until && new Date(userRecord.login_locked_until) >= new Date()) {
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
          await incrementLoginFailedAttempts(userRecord.id, 10, 60 * 60 * 1000, () =>
            getPrivilegedSupabaseClient("login:increment-failed"),
          );
        } catch (e: unknown) {
          const code =
            e instanceof Object && "code" in e ? (e as { code: string }).code : undefined;
          if (code !== "42703") {
            log.error("Failed to update admin user lockout", { error: e });
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
        log.warn("Failed to record audit event for failed login", { error: auditErr });
      }
      return apiError(401, "Invalid credentials");
    }

    if (userRecord && (userRecord.login_failed_attempts > 0 || userRecord.login_locked_until)) {
      try {
        await updateAdminUser(
          userRecord.id,
          { login_failed_attempts: 0, login_locked_until: null },
          () => getPrivilegedSupabaseClient("login:reset-lockout"),
        );
      } catch (e: unknown) {
        const code = e instanceof Object && "code" in e ? (e as { code: string }).code : undefined;
        if (code !== "42703") {
          log.error("Failed to reset admin user lockout", { error: e });
        }
      }
    }

    // AUDIT-FIX A3-001/A7-005: HIBP check moved AFTER TOTP completion to avoid
    // external dependency calls before full authentication is complete.
    let passwordBreached = false;
    let totpNeedsReenroll = false;

    // Enforce TOTP 2FA if enabled on the account
    if (authResult.email) {
      const user = await getAdminUserByEmail(authResult.email, () =>
        getPrivilegedSupabaseClient("login:totp-check"),
      );

      // F-017: TOTP enforcement for super_admin intentionally relaxed.
      // Re-enable once all super_admin accounts have TOTP provisioned.

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

        // M3-FIX: Detect SHA-1 TOTP past hard-deprecation deadline BEFORE attempting
        // verification. The previous code would call verifyTotpToken, get `false`
        // (since the decrypted secret is SHA-1 after deadline), and return the generic
        // "Invalid 2FA token" error. The user has no idea they need to re-enroll —
        // they're just locked out. Return a distinct error code so the UI can
        // redirect them to re-enroll with SHA-256.
        if (
          user.totp_secret &&
          needsSha256Reenrollment(user.totp_secret) &&
          isSha1TotpPastDeadline()
        ) {
          return apiError(403, "Two-factor authentication re-enrollment required", {
            code: "TOTP_REENROLL_REQUIRED",
          });
        }

        // F4 audit: capture the verification result so we can both gate on
        // ok AND persist the consumed time-step on success. Passing
        // user.totp_last_step closes the ~90s replay window (window:1 = 3
        // steps × 30s) — a captured 6-digit code is now single-use.
        const totpResult = user.totp_secret
          ? verifyTotpToken(
              // B-01: Decrypt TOTP secret before verification
              await decryptTotpSecret(user.totp_secret),
              totp_token,
              { lastStep: user.totp_last_step },
            )
          : { ok: false, step: null };

        // AUDIT-FIX A4-004: Digit-only validation for TOTP tokens
        if (typeof totp_token !== "string" || !/^\d{6}$/.test(totp_token) || !totpResult.ok) {
          // AUDIT-FIX A3-002/A1-006: Use atomic increment to prevent race condition
          try {
            await incrementTotpFailedAttempts(user.id, 10, 60 * 60 * 1000, () =>
              getPrivilegedSupabaseClient("login:totp-increment-failed"),
            );
          } catch (e: unknown) {
            const code =
              e instanceof Object && "code" in e ? (e as { code: string }).code : undefined;
            if (code !== "42703") {
              log.error("Failed to update TOTP lockout", { error: e });
            }
          }
          return apiError(401, "Invalid 2FA token");
        }

        // F4: advance the consumed TOTP time-step so the just-used code
        // can't be replayed within its window. Done after the failed-attempts
        // reset below in a single update call to keep the round-trip count
        // bounded.
        // Reset failed attempts on success
        if (user.totp_failed_attempts > 0 || user.totp_locked_until) {
          await updateAdminUser(user.id, { totp_failed_attempts: 0, totp_locked_until: null }, () =>
            getPrivilegedSupabaseClient("login:totp-reset"),
          );
        }
        // Bug 8 (audit-round2-fixes): atomically compare-and-set the consumed
        // TOTP step via the verify_and_set_totp_step RPC. This closes the
        // TOCTOU race where two concurrent requests with the SAME valid code
        // both passed the single-use check before either write persisted.
        // accepted=false means the step was already consumed → replay → reject.
        // A thrown RPC error (e.g. function not deployed, DB outage) is treated
        // as fail-closed: a loud log + 401, because silently accepting TOTPs
        // while the single-use guard is down reintroduces the exact bug this
        // fixes. The replay path does NOT increment the lockout counter (a
        // genuine concurrent double-submit by the same user is not brute force).
        if (totpResult.step != null) {
          let accepted: boolean;
          try {
            accepted = await verifyAndSetTotpStep(user.id, totpResult.step, totpResult.step, () =>
              getPrivilegedSupabaseClient("login:totp-advance-step"),
            );
          } catch (e) {
            log.error(
              "verify_and_set_totp_step RPC failed; failing closed for TOTP replay safety",
              {
                error: e instanceof Error ? e.message : String(e),
              },
            );
            return apiError(401, "Invalid 2FA token");
          }
          if (!accepted) {
            log.warn("TOTP rejected: step already consumed (replay)", { userId: user.id });
            return apiError(401, "Invalid 2FA token");
          }
        }

        // E2-009: Detect legacy SHA-1 TOTP and signal the client to re-enroll.
        // Check the stored (encrypted) form — enc:v1: means SHA-256 era.
        try {
          if (needsSha256Reenrollment(user.totp_secret)) {
            totpNeedsReenroll = true;
          }
        } catch {
          // fail-open: best-effort [criticality:non-critical]
        }
      }
    }

    // AUDIT-FIX A3-001/A7-005: HIBP check now runs AFTER TOTP, so external
    // dependency only fires once full authentication (password + 2FA) is complete.
    try {
      passwordBreached = await isBreachedPassword(password);
    } catch {
      // fail-open: best-effort [criticality:non-critical]
      // fail-open
    }

    // A154-03: suspicious login detection — best-effort, never blocks login
    if (authResult.userId) {
      checkSuspiciousLogin({
        userId: authResult.userId,
        email: authResult.email ?? email,
        ip,
        userAgent: request.headers.get("user-agent") ?? "unknown",
      }).catch(() => {});
    }

    // A100-1 / A98-8: Stamp the original login time into the token so
    // absolute session lifetime can be enforced across refreshes.
    authResult.session_start = Math.floor(Date.now() / 1000);

    // F-030 (step-up): full authentication has just completed here — password,
    // plus TOTP when 2FA is enabled. Stamp the step-up timestamp (milliseconds)
    // so step-up-gated destructive operations are permitted within the step-up
    // window immediately after login. createToken carries this forward on
    // refresh but never renews it, so it expires relative to login; once it
    // lapses, POST /api/auth/step-up re-mints it after re-verification.
    authResult.step_up_at = Date.now();

    // F-035: bind the token to the originating user-agent + IP /24.
    const token = await createToken(authResult, request);

    const response = NextResponse.json(
      {
        ok: true,
        // A154: Advisory flag — if true, prompt the user to change their password.
        // Does NOT block login; the UI should show a security notice.
        ...(passwordBreached ? { password_breached: true } : {}),
        // E2-009: Advisory flag — if true, prompt re-enrollment with SHA-256 TOTP.
        ...(totpNeedsReenroll ? { totp_needs_reenroll: true } : {}),
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

    // A100-1: role-aware absolute session lifetime.
    // super_admin gets a tighter window (12h); regular admin gets 24h.
    // The cookie maxAge is the minimum of the JWT expiry and the
    // role-based cap so the cookie never outlives the token.
    const absoluteMaxAge =
      authResult.role === "super_admin"
        ? MAX_SESSION_AGE_ADMIN_SECONDS
        : MAX_SESSION_AGE_REGULAR_SECONDS;
    const cookieMaxAge = Math.min(ADMIN_JWT_EXPIRY_SECONDS, absoluteMaxAge);

    response.cookies.set(COOKIE_NAME, token, {
      httpOnly: true,
      secure: IS_SECURE_COOKIE,
      sameSite: "strict",
      path: "/",
      maxAge: cookieMaxAge,
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

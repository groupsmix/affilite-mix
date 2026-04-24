import { NextRequest, NextResponse } from "next/server";
import { authenticateUser, createToken, COOKIE_NAME } from "@/lib/auth";
import { checkRateLimit } from "@/lib/rate-limit";
import { verifyTurnstile } from "@/lib/turnstile";
import { getClientIp } from "@/lib/get-client-ip";
import { isValidEmail, normalizeEmail } from "@/lib/validate-email";
import { apiError, rateLimitHeaders, parseJsonBody } from "@/lib/api-error";
import { captureException } from "@/lib/sentry";
import { IS_SECURE_COOKIE } from "@/lib/cookie-utils";
import { getAdminUserByEmail } from "@/lib/dal/admin-users";
import { verifyTotpToken } from "@/lib/totp";

/** 5 login attempts per 15 minutes per IP */
const LOGIN_RATE_LIMIT_IP = { maxRequests: 5, windowMs: 15 * 60 * 1000 };

/** 10 login attempts per 15 minutes per email (prevents brute-force from rotating IPs) */
const LOGIN_RATE_LIMIT_EMAIL = { maxRequests: 10, windowMs: 15 * 60 * 1000 };

export async function POST(request: NextRequest) {
  try {
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
    const { email, password, turnstileToken, totp_token } = bodyOrError as {
      email?: string;
      password?: string;
      turnstileToken?: string;
      totp_token?: string;
    };

    // Verify Turnstile token (skipped in dev if not configured)
    const turnstileResult = await verifyTurnstile(turnstileToken, ip);
    if (!turnstileResult.success) {
      return apiError(403, turnstileResult.error ?? "Captcha verification failed");
    }

    if (!email || !isValidEmail(email)) {
      return apiError(400, "Valid email is required");
    }

    if (!password) {
      return apiError(400, "password is required");
    }

    // Per-email rate limiting — prevents brute-force from rotating IPs
    const normalized = normalizeEmail(email);
    const emailRl = await checkRateLimit(`login-email:${normalized}`, LOGIN_RATE_LIMIT_EMAIL);
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

    const authResult = await authenticateUser(email, password);
    if (!authResult) {
      return apiError(401, "Invalid credentials");
    }

    // Enforce TOTP 2FA if enabled on the account
    if (authResult.email) {
      const user = await getAdminUserByEmail(authResult.email);
      if (user?.totp_enabled) {
        if (!totp_token) {
          return NextResponse.json(
            { requires_2fa: true },
            { status: 200, headers: rateLimitHeaders(LOGIN_RATE_LIMIT_IP, rl) },
          );
        }
        // Separate tight rate limit for TOTP brute-forcing (5 attempts per 5 mins per email)
        const totpLimit = { maxRequests: 5, windowMs: 5 * 60 * 1000 };
        const totpRl = await checkRateLimit(`login-totp:${normalized}`, totpLimit);

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
          !verifyTotpToken(user.totp_secret, totp_token)
        ) {
          return apiError(401, "Invalid 2FA token");
        }
      }
    }

    // F-035: bind the token to the originating user-agent + IP /24.
    const token = await createToken(authResult, request);

    const response = NextResponse.json(
      { ok: true },
      {
        headers: rateLimitHeaders(LOGIN_RATE_LIMIT_IP, rl),
      },
    );
    response.cookies.set(COOKIE_NAME, token, {
      httpOnly: true,
      secure: IS_SECURE_COOKIE,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24, // 24 hours
    });

    return response;
  } catch (err) {
    captureException(err, { context: "[api/auth/login] POST failed:" });
    return apiError(500, "Internal server error");
  }
}

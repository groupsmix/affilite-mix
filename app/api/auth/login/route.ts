import { NextRequest, NextResponse } from "next/server";
import { authenticateUser, createToken, COOKIE_NAME } from "@/lib/auth";
import { checkRateLimit } from "@/lib/rate-limit";
import { verifyTurnstile } from "@/lib/turnstile";
import { getClientIp } from "@/lib/get-client-ip";
import { isValidEmail } from "@/lib/validators";
import { apiError, rateLimitHeaders } from "@/lib/api-error";

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

  const body = await request.json();
  const { email, password, turnstileToken } = body as {
    email?: string;
    password?: string;
    turnstileToken?: string;
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
  const emailRl = await checkRateLimit(`login-email:${email.toLowerCase()}`, LOGIN_RATE_LIMIT_EMAIL);
  if (!emailRl.allowed) {
    return apiError(429, "Too many login attempts for this account. Try again later.", undefined, {
      "Retry-After": String(Math.ceil(emailRl.retryAfterMs / 1000)),
      ...rateLimitHeaders(LOGIN_RATE_LIMIT_EMAIL, emailRl),
    });
  }

  const authResult = await authenticateUser(email, password);
  if (!authResult) {
    return apiError(401, "Invalid credentials");
  }

  const token = await createToken(authResult);

  const response = NextResponse.json({ ok: true }, {
    headers: rateLimitHeaders(LOGIN_RATE_LIMIT_IP, rl),
  });
  response.cookies.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: 60 * 60 * 24, // 24 hours
  });

  return response;
  } catch (err) {
    console.error("[api/auth/login] POST failed:", err);
    return apiError(500, "Internal server error");
  }
}

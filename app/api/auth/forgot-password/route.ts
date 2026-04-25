import { NextResponse } from 'next/server';
import { captureException } from '@sentry/nextjs';

export async function POST(req: Request, ctx: any) {
  const appUrl = process.env.APP_URL;

  if (!appUrl && process.env.NODE_ENV === "production") {
    throw new Error("APP_URL is required for password reset");
  }

  if (!process.env.RESEND_API_KEY) {
    if (process.env.NODE_ENV === "production") {
      captureException(new Error("RESEND_API_KEY missing"));
      return NextResponse.json({ ok: true, message: "If an account with that email exists, a password reset link has been sent." });
    }
    console.warn("[dev] Password reset email provider missing");
  }

  const { email } = await req.json();
  const ip = req.headers.get('x-forwarded-for') || '127.0.0.1';
  
  // Always respond uniformly; do the work in the background.
  ctx.waitUntil(handleResetAsync(email, ip));
  return NextResponse.json({
    ok: true,
    message: "If an account with that email exists, a password reset link has been sent.",
  });
}

async function handleResetAsync(email: string, ip: string) {
  // simulated heavy work (e.g. database lookup, sending email via Resend)
  // Fix 12: Never log password reset links or tokens in production
}

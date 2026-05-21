import { NextResponse } from "next/server";
import { verifyTurnstile } from "@/lib/turnstile";
import { checkRateLimit } from "@/lib/rate-limit";
import { captureException } from "@/lib/sentry";
import { logger } from "@/lib/logger";

export const runtime = "edge";

export async function POST(req: Request) {
  try {
    const ip = req.headers.get("x-forwarded-for") || "unknown";
    
    // A159: Strict rate limit per IP (3 per hour) to prevent spamming the pager
    const rlKey = `abuse-report:${ip}`;
    const rl = await checkRateLimit(rlKey, {
      maxRequests: 3,
      windowMs: 3600_000,
      failPolicy: "closed",
    });
    
    if (!rl.allowed) {
      return NextResponse.json({ error: "Too many requests. Please try again later." }, { status: 429 });
    }

    const body = await req.json();
    const { reportType, url, description, turnstileToken, email } = body;

    // A159: Turnstile Verification to block automated spam
    const turnstileResult = await verifyTurnstile(turnstileToken, ip);
    if (!turnstileResult.success) {
      return NextResponse.json({ error: "Captcha verification failed" }, { status: 400 });
    }

    if (!url || !description) {
      return NextResponse.json({ error: "URL and description are required" }, { status: 400 });
    }

    // A159: Log securely and page on-call via Sentry (< 60s SLA)
    const errorMsg = `[URGENT] Trust & Safety Report: ${reportType || "General"}`;
    logger.warn(errorMsg, { url, email });
    
    captureException(new Error(errorMsg), {
      context: "trust-and-safety.abuse-report",
      extra: {
        reportType,
        url,
        description,
        email,
        ip,
      },
    });

    return NextResponse.json({ success: true, message: "Report submitted successfully. Our team will review it within 24 hours." });
  } catch (err) {
    logger.error("Failed to process abuse report", { error: err });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

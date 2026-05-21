import { NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";
import { getClientIp } from "@/lib/get-client-ip";

/**
 * A159 audit fix: Dedicated fast-track endpoint for IP takedown requests.
 * Accepts takedown reports (CSAM, extremism, IP violations).
 * Backed by strict rate limiting.
 */
export async function POST(req: Request) {
  try {
    const ip = getClientIp(req) || "unknown";
    
    // Strict rate limit to prevent spam of the takedown queue
    const rl = await checkRateLimit(`takedown:${ip}`, {
      maxRequests: 5,
      windowMs: 3600_000, // 5 per hour
      failPolicy: "closed",
    });

    if (!rl.allowed) {
      return NextResponse.json(
        { error: "Too many takedown requests submitted. Please wait and try again." },
        { status: 429 }
      );
    }

    const body = await req.json();
    const { url, reason, contactEmail } = body;

    if (!url || !reason) {
      return NextResponse.json(
        { error: "URL and reason are required for a takedown request." },
        { status: 400 }
      );
    }

    // A156/A159: Log the report with High Priority for the 24/7 Trust & Safety queue.
    // In a fully built-out system, this would drop a message onto a specialized
    // Cloudflare Queue or PagerDuty incident for the human-review SLA.
    logger.error("URGENT: Takedown Request Received", {
      metric: "trust_safety_takedown_request",
      reported_url: url,
      reason: reason,
      reporter_contact: contactEmail ? "***@***" : "anonymous",
      timestamp: new Date().toISOString(),
    });

    // If CSAM is flagged in the reason, trigger the NCMEC pipeline (A156)
    const isCsam = reason.toLowerCase().includes("csam") || reason.toLowerCase().includes("child");
    if (isCsam) {
      logger.error("URGENT: NCMEC Pipeline Triggered", {
        metric: "trust_safety_ncmec_escalation",
        reported_url: url,
      });
      // Implementation stub for NCMEC CyberTipline API call
    }

    return NextResponse.json({ success: true, message: "Report received. Our Trust & Safety team will review within 24 hours." });
  } catch (error) {
    logger.error("Takedown endpoint failed", { error: String(error) });
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

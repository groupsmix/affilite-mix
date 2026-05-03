import { NextRequest, NextResponse } from "next/server";
import { captureException } from "@/lib/sentry";
import { checkRateLimit } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/get-client-ip";

/**
 * POST /api/csp-report — CSP violation report endpoint
 * F-032: Receives CSP violation reports and forwards to Sentry for analysis
 */
const CSP_REPORT_RATE_LIMIT = { maxRequests: 60, windowMs: 60_000 };

// A55.9: CSP reports are an inbound flood vector — cap body size to prevent
// memory exhaustion. Real CSP reports are typically < 2 KB.
const MAX_CSP_REPORT_BYTES = 10_240; // 10 KB

export async function POST(request: NextRequest) {
  // F-06: Per-IP rate limit — documented in csrf-exempt-registry as
  // "cspReportBucket" but was not enforced at runtime. Without this,
  // bot traffic can flood the endpoint and inflate Sentry event volume.
  const ip = getClientIp(request);
  const rl = await checkRateLimit(`csp-report:${ip}`, CSP_REPORT_RATE_LIMIT);
  if (!rl.allowed) {
    return new NextResponse(null, { status: 429 });
  }

  // A55.9: Reject oversized payloads before parsing to prevent memory abuse.
  const contentLength = request.headers.get("content-length");
  if (contentLength && parseInt(contentLength, 10) > MAX_CSP_REPORT_BYTES) {
    return new NextResponse(null, { status: 413 });
  }

  // CSP reports can be sent as JSON or multipart
  let report: Record<string, unknown> = {};
  try {
    const contentType = request.headers.get("content-type") ?? "";
    if (contentType.includes("application/csp-report")) {
      report = await request.json();
    } else if (contentType.includes("application/json")) {
      report = await request.json();
    } else {
      // Try JSON anyway
      report = await request.json();
    }
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  // Extract violation details
  const violation = (report as { "csp-report"?: Record<string, unknown> })["csp-report"];

  if (violation) {
    // Forward to Sentry as a non-crashing event for analysis
    captureException(new Error("CSP Violation"), {
      tags: { csp_violation: true },
      level: "warning" as const,
      contexts: {
        csp_violation: {
          // Strip PII from document URL
          document_url:
            typeof violation.document_uri === "string"
              ? violation.document_uri.replace(/[\?#].*$/, "").slice(0, 200)
              : undefined,
          violated_directive: violation["violated-directive"],
          blocked_uri: violation["blocked-uri"],
          original_policy: violation["original-policy"],
          referrer:
            typeof violation.referrer === "string"
              ? violation.referrer.replace(/[\?#].*$/, "").slice(0, 200)
              : undefined,
        },
      },
    });
  }

  // Always return 204 No Content per CSP spec
  return new NextResponse(null, { status: 204 });
}

import { NextRequest, NextResponse } from "next/server";
import { captureException } from "@/lib/sentry";

/**
 * POST /api/csp-report — CSP violation report endpoint
 * F-032: Receives CSP violation reports and forwards to Sentry for analysis
 */
export async function POST(request: NextRequest) {
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
    captureException(
      new Error("CSP Violation"),
      {
        context: "csp-violation",
        // Strip PII from document URL
        document_url: typeof violation.document_uri === "string"
          ? violation.document_uri.replace(/[\?#].*$/, "").slice(0, 200)
          : undefined,
        violated_directive: violation["violated-directive"],
        blocked_uri: violation["blocked-uri"],
        original_policy: violation["original-policy"],
        referrer: typeof violation.referrer === "string"
          ? violation.referrer.replace(/[\?#].*$/, "").slice(0, 200)
          : undefined,
      },
    );
  }

  // Always return 204 No Content per CSP spec
  return new NextResponse(null, { status: 204 });
}
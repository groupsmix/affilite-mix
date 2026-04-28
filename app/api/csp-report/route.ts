import { NextRequest, NextResponse } from "next/server";
import { captureException } from "@/lib/sentry";
import { checkRateLimit } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/get-client-ip";

/**
 * POST /api/csp-report — CSP violation report endpoint
 * F-032: Receives CSP violation reports and forwards to Sentry for analysis
 */
// F-API-02: Rate limit CSP reports (100/min/IP) with failPolicy: "open" —
// if KV is unavailable, accept reports rather than lose security telemetry.
const CSP_REPORT_RATE_LIMIT = {
  maxRequests: 100,
  windowMs: 60_000,
  failPolicy: "open" as const,
};

/** F-005/F-006: 64KB body size cap as documented in csrf-exempt-registry */
const CSP_REPORT_MAX_BODY_BYTES = 64 * 1024;

export async function POST(request: NextRequest) {
  // F-06: Per-IP rate limit — documented in csrf-exempt-registry as
  // "cspReportBucket" but was not enforced at runtime. Without this,
  // bot traffic can flood the endpoint and inflate Sentry event volume.
  const ip = getClientIp(request);
  const rl = await checkRateLimit(`csp-report:${ip}`, CSP_REPORT_RATE_LIMIT);
  if (!rl.allowed) {
    return new NextResponse(null, { status: 429 });
  }

  // F-005/F-006: Enforce 64KB body size cap and parse CSP report
  let report: Record<string, unknown> = {};
  try {
    // Check Content-Length first for early rejection
    const contentLength = request.headers.get("content-length");
    if (contentLength) {
      const length = parseInt(contentLength, 10);
      if (!isNaN(length) && length > CSP_REPORT_MAX_BODY_BYTES) {
        return new NextResponse(null, { status: 413 }); // Payload Too Large
      }
    }

    // Read body with streaming size enforcement
    const reader = request.body?.getReader();
    if (reader) {
      const chunks: Uint8Array[] = [];
      let totalLength = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        totalLength += value.length;
        if (totalLength > CSP_REPORT_MAX_BODY_BYTES) {
          reader.cancel();
          return new NextResponse(null, { status: 413 });
        }
        chunks.push(value);
      }

      // Concatenate and parse
      const body = new Uint8Array(totalLength);
      let offset = 0;
      for (const chunk of chunks) {
        body.set(chunk, offset);
        offset += chunk.length;
      }
      const text = new TextDecoder().decode(body);
      report = JSON.parse(text) as Record<string, unknown>;
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
        tags: { csp_violation: true },
        level: "warning" as const,
        contexts: {
          csp_violation: {
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
        },
      },
    );
  }

  // Always return 204 No Content per CSP spec
  return new NextResponse(null, { status: 204 });
}
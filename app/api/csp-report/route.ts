import { NextRequest, NextResponse } from "next/server";
import { captureException } from "@/lib/sentry";
import { checkRateLimit } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/get-client-ip";

/**
 * POST /api/csp-report — CSP violation report endpoint
 * F-032: Receives CSP violation reports and forwards to Sentry for analysis
 */
const CSP_REPORT_RATE_LIMIT = { maxRequests: 60, windowMs: 60_000 };

/**
 * PR-F P2-C: Hard cap on the CSP-report payload size. The spec
 * (https://www.w3.org/TR/CSP3/#reporting) says the report is a small
 * JSON object with a fixed shape (~10 fields, all short strings). Real
 * reports observed in production are < 1 KB. Anything above 8 KB is
 * almost certainly a misbehaving extension or hostile client; refusing
 * to parse it keeps the Sentry event volume bounded and prevents an
 * attacker from forcing an arbitrary-size JSON parse.
 */
const CSP_REPORT_MAX_BYTES = 8 * 1024;
const ALLOWED_CSP_REPORT_CONTENT_TYPES = [
  "application/csp-report",
  "application/json",
  "application/reports+json",
];

export async function POST(request: NextRequest) {
  // F-06: Per-IP rate limit — documented in csrf-exempt-registry as
  // "cspReportBucket" but was not enforced at runtime. Without this,
  // bot traffic can flood the endpoint and inflate Sentry event volume.
  const ip = getClientIp(request);
  const rl = await checkRateLimit(`csp-report:${ip}`, CSP_REPORT_RATE_LIMIT);
  if (!rl.allowed) {
    return new NextResponse(null, { status: 429 });
  }

  const contentType = (request.headers.get("content-type") ?? "").toLowerCase();
  if (
    !ALLOWED_CSP_REPORT_CONTENT_TYPES.some((allowed) => contentType.startsWith(allowed))
  ) {
    return new NextResponse(null, { status: 415 });
  }

  // PR-F P2-C: enforce payload cap. The Content-Length header is a
  // strong hint but not authoritative (chunked transfer can omit it),
  // so we also count the bytes we read. We use request.text() and check
  // length before JSON.parse to avoid materialising a giant object.
  const contentLengthHeader = request.headers.get("content-length");
  if (contentLengthHeader) {
    const declared = Number.parseInt(contentLengthHeader, 10);
    if (Number.isFinite(declared) && declared > CSP_REPORT_MAX_BYTES) {
      return new NextResponse(null, { status: 413 });
    }
  }

  let raw: string;
  try {
    raw = await request.text();
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  if (raw.length > CSP_REPORT_MAX_BYTES) {
    return new NextResponse(null, { status: 413 });
  }

  // CSP reports can be sent as JSON or multipart (we treat the body
  // as JSON across all three content-type variants — the spec only
  // defines a JSON shape, and `application/csp-report` is a JSON
  // sub-type from the legacy CSP 2 spec).
  // A100-6: Reject deeply nested JSON to prevent CPU spikes from
  // crafted payloads. CSP reports have a flat structure (max 2 levels:
  // {"csp-report": {fields}}). Anything deeper is suspicious.
  const MAX_NESTING = 5;
  let depth = 0;
  for (let i = 0; i < raw.length; i++) {
    const c = raw[i];
    if (c === "{" || c === "[") {
      depth++;
      if (depth > MAX_NESTING) {
        return NextResponse.json({ ok: false }, { status: 400 });
      }
    } else if (c === "}" || c === "]") {
      depth--;
    }
  }

  let report: Record<string, unknown> = {};
  try {
    report = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    // fail-open: best-effort [criticality:non-critical]
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
          // Strip PII from document URL.
          // SECURITY: using split() instead of a `[?#].*$` regex avoids a
          // polynomial-ReDoS shape on long attacker-controlled inputs.
          document_url:
            typeof violation.document_uri === "string"
              ? violation.document_uri.split(/[?#]/, 1)[0]!.slice(0, 200)
              : undefined,
          violated_directive: violation["violated-directive"],
          blocked_uri: violation["blocked-uri"],
          original_policy: violation["original-policy"],
          referrer:
            typeof violation.referrer === "string"
              ? violation.referrer.split(/[?#]/, 1)[0]!.slice(0, 200)
              : undefined,
        },
      },
    });
  }

  // Always return 204 No Content per CSP spec
  return new NextResponse(null, { status: 204 });
}

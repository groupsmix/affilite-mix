import { NextResponse } from "next/server";
import { getCurrentSite } from "@/lib/site-context";
import { logger } from "@/lib/logger";
import { captureException } from "@/lib/sentry";

/**
 * G-02 — dynamic /.well-known/security.txt.
 *
 * The previous static file in `public/.well-known/security.txt`:
 *   - Left `[domain]` placeholders in Contact / Encryption.
 *   - Was missing the `Expires:` field, which RFC 9116 §2.5.5 requires
 *     and without which conformance tools (e.g. securitytxt.org) mark
 *     the document as invalid.
 *   - Returned the same Canonical URL to every site even though each
 *     tenant serves from its own domain.
 *
 * This route handler resolves the current site via the same site-
 * context header the rest of the app uses, then returns a fully
 * populated security.txt per RFC 9116. The `Expires:` field is rolled
 * forward to 365 days from "now" on every request so the document is
 * never stale — search-engine / automated scanners refetch after
 * expiry.
 */
const EXPIRY_MS = 365 * 24 * 60 * 60 * 1000;

function formatExpiresIso(fromMs: number): string {
  // RFC 9116 §2.5.5 requires ISO 8601 with a 'Z' timezone suffix.
  return new Date(fromMs + EXPIRY_MS).toISOString();
}

export async function GET() {
  try {
    const site = await getCurrentSite();
    const contact = site.brand.contactEmail || `security@${site.domain}`;
    const canonical = `https://${site.domain}/.well-known/security.txt`;

    const lines = [
      `Contact: mailto:${contact}`,
      `Expires: ${formatExpiresIso(Date.now())}`,
      `Encryption: https://keys.openpgp.org/search?q=${encodeURIComponent(contact)}`,
      "Preferred-Languages: en, ar",
      `Canonical: ${canonical}`,
      "Policy: https://github.com/groupsmix/affilite-mix/blob/main/SECURITY.md",
      "",
      "# Please report security vulnerabilities via the Contact address above.",
      "# We operate a responsible-disclosure program; do not open a public",
      "# GitHub issue for sensitive findings.",
      "",
      "# Scope",
      `# - ${site.name} (${site.domain})`,
      "# - Cloudflare Workers deployment",
      "# - Supabase backend",
      "",
      "# Out of scope",
      "# - Third-party services (Stripe, Resend, Cloudflare AI)",
      "# - Social engineering attacks",
      "# - Denial of service attacks on third-party infrastructure",
      "",
      "# Expected response times",
      "# - Acknowledgement: 48 hours",
      "# - Initial assessment: 7 days",
      "# - Resolution varies by severity (critical: 24-72h, high: 1-2 weeks)",
      "",
    ];

    return new NextResponse(lines.join("\n"), {
      status: 200,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        // Allow CDN to cache but still refetch often enough to keep
        // the Expires: field monotonic.
        "Cache-Control": "public, max-age=3600, s-maxage=3600",
      },
    });
  } catch (err) {
    // Missing site context (unknown host reaching /.well-known) — do not
    // publish another tenant's contact or canonical URL.
    logger.warn("security.txt: site resolution failed; returning not found", {
      error: err instanceof Error ? err.message : String(err),
    });
    captureException(err, { context: "[security.txt] site resolution failed" });
    return new NextResponse(null, { status: 404 });
  }
}

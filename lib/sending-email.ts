/**
 * A144-01 / A144-02: Resolve the transactional email sender address
 * for a given site.
 *
 * Priority:
 *   1. `site.sendingEmail` — per-tenant override in site config.
 *   2. `NEWSLETTER_FROM_EMAIL` env var — global fallback.
 *   3. `noreply@<site.domain>` — domain-derived fallback.
 *
 * The caller MUST validate the domain portion of the resulting address
 * is verified in the email provider (Resend). A warning is logged when
 * the fallback is used so operators can identify sites that need
 * explicit `sendingEmail` configuration.
 */

import type { SiteDefinition } from "@/config/site-definition";
import { logger } from "@/lib/logger";

/**
 * Resolve the `From:` email address for transactional emails sent on
 * behalf of a site. Returns a sanitized, CRLF-free email address.
 */
export function resolveSendingEmail(
  site: Pick<SiteDefinition, "id" | "domain" | "sendingEmail" | "name">,
  safeDomain: string,
): string {
  // A144-01: prefer per-tenant sendingEmail for SPF/DKIM alignment
  if (site.sendingEmail) {
    return sanitizeEmailHeader(site.sendingEmail);
  }

  const envOverride = process.env.NEWSLETTER_FROM_EMAIL;
  if (envOverride) {
    // A144-02: log when global override is used for a non-matching domain
    const envDomain = envOverride.split("@")[1]?.toLowerCase();
    if (envDomain && envDomain !== safeDomain.toLowerCase()) {
      logger.warn(
        "[A144-02] NEWSLETTER_FROM_EMAIL domain does not match site domain — SPF alignment may fail",
        { siteId: site.id, envDomain, siteDomain: safeDomain },
      );
    }
    return sanitizeEmailHeader(envOverride);
  }

  return `noreply@${safeDomain}`;
}

function sanitizeEmailHeader(email: string): string {
  return email
    .normalize("NFC")
    .replace(/[\r\n\0]/g, "")
    .trim();
}

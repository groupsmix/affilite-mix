/**
 * Resend email service utilities.
 * F-020: Domain verification check for sending domains.
 */
import { logger } from "./logger";

export interface DomainStatus {
  name: string;
  status: "unverified" | "pending" | "active" | "error";
  dnsRecords?: {
    recordType: string;
    name: string;
    value: string;
    status: "pending" | "valid" | "invalid";
  }[];
}

export interface VerificationResult {
  verified: boolean;
  domain: string;
  status: DomainStatus | null;
  error?: string;
}

/**
 * Fetch all domains from Resend and check if the configured sending domain is verified.
 *
 * @param resendApiKey - RESEND_API_KEY from environment
 * @param sendingDomain - The domain configured as NEWSLETTER_FROM_EMAIL domain (e.g., "noreply@example.com" → "example.com")
 * @returns VerificationResult with domain status
 */
export async function checkResendDomainVerification(
  resendApiKey: string,
  sendingDomain: string,
): Promise<VerificationResult> {
  if (!resendApiKey) {
    return {
      verified: false,
      domain: sendingDomain,
      status: null,
      error: "RESEND_API_KEY not set",
    };
  }

  if (!sendingDomain) {
    return { verified: false, domain: "", status: null, error: "Sending domain not configured" };
  }

  try {
    const response = await fetch("https://api.resend.com/domains", {
      method: "GET",
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.error("Resend domain check failed", { status: response.status, error: errorText });
      return {
        verified: false,
        domain: sendingDomain,
        status: null,
        error: `Resend API error: ${response.status}`,
      };
    }

    interface ResendDomain {
      id: string;
      object: string;
      name: string;
      status: string;
      dns_records?: Array<{
        record_type: string;
        name: string;
        value: string;
        status: string;
      }>;
    }

    const body: { data: ResendDomain[] } = await response.json();
    const domains = body.data ?? [];

    // Find the matching domain (case-insensitive)
    const normalizedSendingDomain = sendingDomain.toLowerCase();
    const configuredDomain = domains.find((d) => d.name.toLowerCase() === normalizedSendingDomain);

    if (!configuredDomain) {
      return {
        verified: false,
        domain: sendingDomain,
        status: null,
        error: "Domain not found in Resend — add and verify it in Resend dashboard",
      };
    }

    // Domain status: "unverified" means MX/DKIM not added
    // "active" means it's verified and ready to send
    // "pending" means verification in progress
    const isVerified = configuredDomain.status === "active";

    const domainStatus: DomainStatus = {
      name: configuredDomain.name,
      status: configuredDomain.status as DomainStatus["status"],
      dnsRecords: configuredDomain.dns_records?.map((record) => ({
        recordType: record.record_type,
        name: record.name,
        value: record.value,
        status: record.status as "pending" | "valid" | "invalid",
      })),
    };

    if (!isVerified) {
      logger.warn("Resend domain not verified", {
        domain: sendingDomain,
        status: configuredDomain.status,
      });
    }

    return {
      verified: isVerified,
      domain: sendingDomain,
      status: domainStatus,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    logger.error("Resend domain verification check failed", { error: message });
    return {
      verified: false,
      domain: sendingDomain,
      status: null,
      error: message,
    };
  }
}

/**
 * Pre-flight check: ensure the newsletter sending domain is verified before
 * attempting to send transactional emails.
 *
 * Call this before any email send operation in critical paths.
 */
export async function verifyNewsletterDomain(): Promise<boolean> {
  const resendApiKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.NEWSLETTER_FROM_EMAIL ?? process.env.APP_URL;

  // Extract domain from email (e.g., "noreply@example.com" → "example.com")
  let sendingDomain = "";
  if (fromEmail && fromEmail.includes("@")) {
    sendingDomain = fromEmail.split("@")[1];
  } else if (fromEmail) {
    // If it's just a domain string
    sendingDomain = fromEmail.replace(/^https?:\/\//, "").split(":")[0];
  }

  const result = await checkResendDomainVerification(resendApiKey ?? "", sendingDomain);

  if (!result.verified) {
    logger.error("Newsletter domain not verified — email sending blocked", {
      domain: result.domain,
      error: result.error,
      status: result.status,
    });
    return false;
  }

  return true;
}

import { truncateIp } from "./get-client-ip";

/**
 * Shared PII deny-list for structured logs and console.error paths.
 * Kept separate from logger.ts so sentry.ts can import without circular deps.
 */
const DENIED_LOG_FIELDS = new Set([
  "email",
  "password",
  "secret",
  "token",
  "cookie",
  "authorization",
  "body",
  "password_hash",
  "totp_secret",
  "reset_token",
  "api_key",
  "apikey",
  "access_token",
  "refresh_token",
  "phone",
  "phone_number",
  "mobile",
  "ssn",
  "social_security",
  "national_insurance",
  "ni_number",
  "dob",
  "date_of_birth",
  "card",
  "card_number",
  "pan",
  "cvv",
  "cvc",
  "expiry",
  "card_expiry",
  "payment_method",
  "bank_account",
  "iban",
  "routing_number",
  "private_key",
  "private",
  "credential",
  "credentials",
  "passphrase",
  "pin",
]);

const PII_PATTERNS = [
  /email/i,
  /token/i,
  /secret/i,
  /password/i,
  /credential/i,
  /card(?:_?num)/i,
  /cvv|cvc/i,
  /ssn|social.?security/i,
  /private.?key/i,
  /api.?key/i,
];

function isPiiLogKey(key: string): boolean {
  if (DENIED_LOG_FIELDS.has(key.toLowerCase())) return true;
  return PII_PATTERNS.some((pattern) => pattern.test(key));
}

/** Shallow-redact PII keys in a log context object (audit EL-003 / OP-001). */
export function redactLogContext(context: unknown): unknown {
  if (context == null) return "";
  if (typeof context === "string") return context.replace(/[\r\n]+/g, " ");
  if (typeof context !== "object") return context;

  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(context as Record<string, unknown>)) {
    if (isPiiLogKey(k)) {
      out[k] = "[REDACTED]";
      continue;
    }
    if (/^(?:req_)?ip(?:_address)?$|peer(?:_ip)?|^client_ip$/i.test(k) && typeof v === "string") {
      out[k] = truncateIp(v);
      continue;
    }
    out[k] = typeof v === "string" ? v.replace(/[\r\n]+/g, " ") : v;
  }
  return out;
}

/**
 * A154-03: Suspicious login detection and email alerting for admin accounts.
 *
 * Fires a best-effort email alert via Resend when an admin account logs in
 * from a previously unseen IP or User-Agent. The last-seen values are stored
 * in APP_CACHE_KV with a TTL so that the "known" set rolls automatically.
 *
 * Failure mode: fail-open — a KV miss or Resend failure never blocks login.
 */

import { getAppCacheKV } from "@/lib/runtime-env";
import { emitMetric } from "@/lib/metrics";
import { captureException } from "@/lib/sentry";
import { logger } from "@/lib/logger";

const KNOWN_TTL_SECONDS = 30 * 24 * 60 * 60; // 30 days

interface SuspiciousLoginCheck {
  userId: string;
  email: string;
  ip: string;
  userAgent: string;
}

/**
 * Check whether the login originates from a known IP/UA combination.
 * If not, send a suspicious-login alert email. Best-effort, never throws.
 */
export async function checkSuspiciousLogin(params: SuspiciousLoginCheck): Promise<void> {
  try {
    const kv = getAppCacheKV();
    if (!kv) return; // no KV — skip silently in dev

    const key = `admin-login-known:${params.userId}`;
    const stored = await kv.get(key).catch(() => null);

    const fingerprint = `${params.ip}|${params.userAgent.slice(0, 128)}`;
    const knownSet: string[] = stored ? JSON.parse(stored) : [];

    if (knownSet.includes(fingerprint)) {
      // Known fingerprint — refresh TTL
      await kv
        .put(key, JSON.stringify(knownSet), { expirationTtl: KNOWN_TTL_SECONDS })
        .catch(() => {});
      return;
    }

    // New fingerprint — update KV and alert
    const updated = [...knownSet, fingerprint].slice(-10); // keep last 10
    await kv
      .put(key, JSON.stringify(updated), { expirationTtl: KNOWN_TTL_SECONDS })
      .catch(() => {});

    // Only alert if there were previous logins (first login is expected)
    if (knownSet.length === 0) return;

    await sendSuspiciousLoginAlert(params);
  } catch (err) {
    // fail-open: best-effort [criticality:non-critical]
    captureException(err, { tag: "suspicious-login:check" });
    // 24-hour quick wins: Emit fail-open metric
    emitMetric("fail_open_total", 1, { fail_open_location: "suspicious-login-alert" });
  }
}

async function sendSuspiciousLoginAlert(params: SuspiciousLoginCheck): Promise<void> {
  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) return;

  const alertEmail = process.env.SECURITY_ALERT_EMAIL ?? params.email;
  const fromEmail = process.env.NEWSLETTER_FROM_EMAIL;
  if (!fromEmail) {
    const error = new Error("Suspicious-login alert sender is not configured");
    logger.error(error.message, { userId: params.userId });
    captureException(error, { tag: "suspicious-login:sender-not-configured" });
    return;
  }

  const now = new Date().toISOString();
  const subject = "Security Alert: New login from unfamiliar device";
  const text = [
    `A new login to your admin account was detected.`,
    ``,
    `Account: ${params.email}`,
    `IP Address: ${params.ip}`,
    `User Agent: ${params.userAgent.slice(0, 200)}`,
    `Time: ${now}`,
    ``,
    `If this was you, no action is needed.`,
    `If this was NOT you, change your password immediately and review your account activity.`,
  ].join("\n");

  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;margin:0;padding:24px;background:#f4f4f5;">
  <div style="max-width:520px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
    <div style="background:#dc2626;padding:20px 24px;">
      <h1 style="margin:0;color:#fff;font-size:18px;">Security Alert</h1>
    </div>
    <div style="padding:24px;">
      <p style="margin:0 0 16px;color:#111827;">A new login to your admin account was detected from an unfamiliar device or location.</p>
      <table style="width:100%;border-collapse:collapse;margin:0 0 16px;">
        <tr><td style="padding:8px 0;color:#6b7280;width:100px;">Account</td><td style="padding:8px 0;color:#111827;">${escapeHtml(params.email)}</td></tr>
        <tr><td style="padding:8px 0;color:#6b7280;">IP Address</td><td style="padding:8px 0;color:#111827;">${escapeHtml(params.ip)}</td></tr>
        <tr><td style="padding:8px 0;color:#6b7280;">Time</td><td style="padding:8px 0;color:#111827;">${escapeHtml(now)}</td></tr>
      </table>
      <p style="margin:0 0 8px;color:#111827;font-weight:600;">If this was NOT you:</p>
      <ul style="margin:0 0 16px;padding:0 0 0 20px;color:#4b5563;">
        <li>Change your password immediately</li>
        <li>Review your account activity</li>
        <li>Enable 2FA if not already active</li>
      </ul>
      <p style="margin:0;font-size:13px;color:#9ca3af;">If this was you, no action is needed.</p>
    </div>
  </div>
</body></html>`;

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: fromEmail,
        to: [alertEmail],
        subject,
        html,
        text,
      }),
    });
    if (!res.ok) {
      logger.warn("[suspicious-login] alert email failed", { status: res.status });
    }
  } catch (err) {
    captureException(err, { tag: "suspicious-login:email" });
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

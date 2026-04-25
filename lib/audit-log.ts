import { captureException } from '@sentry/browser';

const HIGH_RISK_ACTIONS = [
  "admin.created",
  "admin.role_changed",
  "admin.deleted",
  "site.membership_changed",
  "product.deleted",
  "content.deleted",
  "cron.triggered_manually",
  "service_role.data_export",
  "auth.password_reset_spike",
];

export async function recordAuditEvent(row: any) {
  try {
    // 30. Add admin audit-log review and alerting for high-risk actions
    if (HIGH_RISK_ACTIONS.includes(row.action)) {
      console.warn(`[HIGH RISK ACTION] User ${row.user_id} performed ${row.action} on ${row.resource_id}`);
      captureException(new Error(`High Risk Action: ${row.action}`), {
        extra: { ...row },
        tags: { audit: "high_risk" },
        level: "warning"
      });
    }

    // Write audit event to DB
  } catch (retryError) {
    captureException(retryError, { context: "audit-log.retry-failed", row });
  }
}

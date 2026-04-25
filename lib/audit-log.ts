import { captureException } from '@sentry/browser';

export async function recordAuditEvent(row: any) {
  try {
    // Write audit event
  } catch (retryError) {
    captureException(retryError, { context: "audit-log.retry-failed", row });
  }
}

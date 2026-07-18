/**
 * Stable request/response envelopes for the automation API (`/api/automation/v1`).
 *
 * Every automation response uses one of two shapes so an autonomous client
 * can rely on a single contract:
 *
 *   success: { ok: true,  data: <T>, meta: {...} }
 *   error:   { ok: false, error: { code, message, retryable, details? }, meta: {...} }
 *
 * This deliberately differs from the browser-oriented `apiError` envelope in
 * `lib/api-error.ts`: machine clients switch on `error.code` + `retryable`,
 * not HTTP text.
 */
import { NextResponse } from "next/server";
import { API_VERSION_HEADER, CURRENT_API_VERSION } from "@/lib/api-version";

export type AutomationErrorCode =
  | "AUTOMATION_UNAUTHENTICATED"
  | "AUTOMATION_TOKEN_INVALID"
  | "AUTOMATION_TOKEN_EXPIRED"
  | "AUTOMATION_TOKEN_REVOKED"
  | "AUTOMATION_SCOPE_MISSING"
  | "AUTOMATION_SITE_NOT_FOUND"
  | "AUTOMATION_BAD_REQUEST"
  | "AUTOMATION_VALIDATION_ERROR"
  | "AUTOMATION_IDEMPOTENCY_CONFLICT"
  | "AUTOMATION_POLICY_APPROVAL_REQUIRED"
  | "AUTOMATION_POLICY_DENIED"
  | "AUTOMATION_RATE_LIMITED"
  | "AUTOMATION_LIMIT_EXCEEDED"
  | "AUTOMATION_NOT_FOUND"
  | "AUTOMATION_AI_NOT_CONFIGURED"
  | "AUTOMATION_SLUG_CONFLICT"
  | "AUTOMATION_INTERNAL_ERROR";

export interface AutomationMeta {
  request_id: string;
  api_version: string;
  run_id?: string;
  action_id?: string;
}

export interface AutomationErrorBody {
  ok: false;
  error: {
    code: AutomationErrorCode;
    message: string;
    retryable: boolean;
    details?: Record<string, unknown>;
  };
  meta: AutomationMeta;
}

export interface AutomationSuccessBody<T> {
  ok: true;
  data: T;
  meta: AutomationMeta;
}

function baseMeta(requestId: string, extra?: Partial<AutomationMeta>): AutomationMeta {
  return {
    request_id: requestId,
    api_version: CURRENT_API_VERSION,
    ...(extra?.run_id ? { run_id: extra.run_id } : {}),
    ...(extra?.action_id ? { action_id: extra.action_id } : {}),
  };
}

function withVersionHeader(res: NextResponse): NextResponse {
  res.headers.set(API_VERSION_HEADER, CURRENT_API_VERSION);
  return res;
}

export function automationSuccess<T>(
  data: T,
  requestId: string,
  opts?: { status?: number; meta?: Partial<AutomationMeta>; headers?: Record<string, string> },
): NextResponse {
  const body: AutomationSuccessBody<T> = {
    ok: true,
    data,
    meta: baseMeta(requestId, opts?.meta),
  };
  return withVersionHeader(
    NextResponse.json(body, { status: opts?.status ?? 200, headers: opts?.headers }),
  );
}

const STATUS_BY_CODE: Record<AutomationErrorCode, number> = {
  AUTOMATION_UNAUTHENTICATED: 401,
  AUTOMATION_TOKEN_INVALID: 401,
  AUTOMATION_TOKEN_EXPIRED: 401,
  AUTOMATION_TOKEN_REVOKED: 401,
  AUTOMATION_SCOPE_MISSING: 403,
  AUTOMATION_SITE_NOT_FOUND: 404,
  AUTOMATION_BAD_REQUEST: 400,
  AUTOMATION_VALIDATION_ERROR: 422,
  AUTOMATION_IDEMPOTENCY_CONFLICT: 409,
  AUTOMATION_POLICY_APPROVAL_REQUIRED: 202,
  AUTOMATION_POLICY_DENIED: 403,
  AUTOMATION_RATE_LIMITED: 429,
  AUTOMATION_LIMIT_EXCEEDED: 429,
  AUTOMATION_NOT_FOUND: 404,
  AUTOMATION_AI_NOT_CONFIGURED: 503,
  AUTOMATION_SLUG_CONFLICT: 409,
  AUTOMATION_INTERNAL_ERROR: 500,
};

const RETRYABLE_CODES: ReadonlySet<AutomationErrorCode> = new Set([
  "AUTOMATION_RATE_LIMITED",
  "AUTOMATION_LIMIT_EXCEEDED",
  "AUTOMATION_INTERNAL_ERROR",
]);

export function automationError(
  code: AutomationErrorCode,
  message: string,
  requestId: string,
  opts?: {
    status?: number;
    retryable?: boolean;
    details?: Record<string, unknown>;
    meta?: Partial<AutomationMeta>;
    headers?: Record<string, string>;
  },
): NextResponse {
  const body: AutomationErrorBody = {
    ok: false,
    error: {
      code,
      message,
      retryable: opts?.retryable ?? RETRYABLE_CODES.has(code),
      ...(opts?.details ? { details: opts.details } : {}),
    },
    meta: baseMeta(requestId, opts?.meta),
  };
  return withVersionHeader(
    NextResponse.json(body, {
      status: opts?.status ?? STATUS_BY_CODE[code],
      headers: opts?.headers,
    }),
  );
}

/** Derive a stable request id from the trace header or a fresh uuid. */
export function requestIdFrom(request: Request): string {
  return (
    request.headers.get("x-trace-id") ?? request.headers.get("x-request-id") ?? crypto.randomUUID()
  );
}

import { NextResponse } from "next/server";
import type { RateLimitResult, RateLimitConfig } from "@/lib/rate-limit";

/**
 * Standardised error codes for programmatic error handling.
 *
 * AUDIT-FIX: Previously API errors returned only a plain-English `error`
 * string, forcing clients to parse free-text messages to distinguish error
 * types. Adding a machine-readable `code` field lets clients switch on a
 * stable enum value while the human-readable `error` message can evolve.
 */
export type ApiErrorCode =
  | "BAD_REQUEST"
  | "INVALID_JSON"
  | "VALIDATION_ERROR"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "CSRF_FAILED"
  | "NOT_FOUND"
  | "RATE_LIMITED"
  | "CONFLICT"
  | "PAYLOAD_TOO_LARGE"
  | "SERVICE_UNAVAILABLE"
  | "INTERNAL_ERROR"
  | "CAPTCHA_FAILED"
  | "TOTP_REQUIRED"
  | "QUOTA_EXCEEDED";

/** Map HTTP status codes to default error codes when no explicit code is given. */
function defaultCodeForStatus(status: number): ApiErrorCode {
  switch (status) {
    case 400:
      return "BAD_REQUEST";
    case 401:
      return "UNAUTHORIZED";
    case 403:
      return "FORBIDDEN";
    case 404:
      return "NOT_FOUND";
    case 409:
      return "CONFLICT";
    case 413:
      return "PAYLOAD_TOO_LARGE";
    case 429:
      return "RATE_LIMITED";
    case 503:
      return "SERVICE_UNAVAILABLE";
    default:
      return "INTERNAL_ERROR";
  }
}

/**
 * Standardised API error response.
 *
 * Every error returned by our API routes uses this shape so clients can
 * rely on a single `{ error: string; code: string; details?: unknown }` contract.
 *
 * The optional `code` parameter lets callers supply a specific error code;
 * when omitted, a sensible default is inferred from the HTTP status.
 */
export function apiError(
  status: number,
  message: string,
  details?: unknown,
  headers?: Record<string, string>,
  code?: ApiErrorCode,
): NextResponse {
  const body: { error: string; code: ApiErrorCode; details?: unknown } = {
    error: message,
    code: code ?? defaultCodeForStatus(status),
  };
  if (details !== undefined) body.details = details;
  return NextResponse.json(body, { status, headers });
}

/**
 * Build standard rate-limit response headers.
 *
 * Returns headers that inform the client about their current rate-limit
 * window so legitimate integrators and debugging tools can adjust their
 * request cadence.
 *
 *   X-RateLimit-Limit     — max requests allowed in the window
 *   X-RateLimit-Remaining — requests remaining in the current window
 *   X-RateLimit-Reset     — Unix epoch (seconds) when the window resets
 */
/**
 * Safely parse the JSON body of a request.
 * Returns the parsed body on success, or a 400 NextResponse on failure.
 */
export async function parseJsonBody(
  request: Request,
): Promise<Record<string, unknown> | NextResponse> {
  try {
    return (await request.json()) as Record<string, unknown>;
  } catch {
    return apiError(400, "Invalid JSON body", undefined, undefined, "INVALID_JSON");
  }
}

/**
 * F-A91-01: Error catalog -- maps each ApiErrorCode to a default user-facing
 * message in each supported language. Allows the client to display a localised
 * error without parsing free-text strings, and decouples the internal error
 * message from what the user sees.
 *
 * Usage on the client:
 *   const msg = ERROR_CATALOG[response.code]?.[locale] ?? response.error;
 */
export const ERROR_CATALOG: Record<ApiErrorCode, Record<"en" | "ar", string>> = {
  BAD_REQUEST: {
    en: "The request was invalid. Please check your input and try again.",
    ar: "الطلب غير صالح. يرجى التحقق من البيانات والمحاولة مرة أخرى.",
  },
  INVALID_JSON: {
    en: "The request body could not be parsed. Please send valid JSON.",
    ar: "تعذر تحليل نص الطلب. يرجى إرسال JSON صالح.",
  },
  VALIDATION_ERROR: {
    en: "Some fields are invalid. Please correct the highlighted errors.",
    ar: "بعض الحقول غير صالحة. يرجى تصحيح الأخطاء المميزة.",
  },
  UNAUTHORIZED: {
    en: "You must be logged in to perform this action.",
    ar: "يجب تسجيل الدخول لتنفيذ هذا الإجراء.",
  },
  FORBIDDEN: {
    en: "You do not have permission to perform this action.",
    ar: "ليس لديك صلاحية لتنفيذ هذا الإجراء.",
  },
  CSRF_FAILED: {
    en: "Your session may have expired. Please refresh the page and try again.",
    ar: "ربما انتهت جلستك. يرجى تحديث الصفحة والمحاولة مرة أخرى.",
  },
  NOT_FOUND: {
    en: "The requested resource was not found.",
    ar: "لم يتم العثور على المورد المطلوب.",
  },
  RATE_LIMITED: {
    en: "Too many requests. Please wait a moment and try again.",
    ar: "طلبات كثيرة جدًا. يرجى الانتظار لحظة والمحاولة مرة أخرى.",
  },
  CONFLICT: {
    en: "This action conflicts with the current state. Please refresh and try again.",
    ar: "هذا الإجراء يتعارض مع الحالة الحالية. يرجى التحديث والمحاولة مرة أخرى.",
  },
  PAYLOAD_TOO_LARGE: {
    en: "The uploaded file is too large. Please reduce the file size.",
    ar: "الملف المرفوع كبير جدًا. يرجى تقليل حجم الملف.",
  },
  SERVICE_UNAVAILABLE: {
    en: "The service is temporarily unavailable. Please try again later.",
    ar: "الخدمة غير متاحة مؤقتًا. يرجى المحاولة لاحقًا.",
  },
  INTERNAL_ERROR: {
    en: "An unexpected error occurred. Please try again or contact support.",
    ar: "حدث خطأ غير متوقع. يرجى المحاولة مرة أخرى أو الاتصال بالدعم.",
  },
  CAPTCHA_FAILED: {
    en: "CAPTCHA verification failed. Please try again.",
    ar: "فشل التحقق من CAPTCHA. يرجى المحاولة مرة أخرى.",
  },
  TOTP_REQUIRED: {
    en: "Two-factor authentication is required. Please enter your verification code.",
    ar: "المصادقة الثنائية مطلوبة. يرجى إدخال رمز التحقق.",
  },
  QUOTA_EXCEEDED: {
    en: "You have exceeded your usage quota. Please upgrade your plan or wait for the reset.",
    ar: "لقد تجاوزت حصة الاستخدام. يرجى ترقية خطتك أو الانتظار حتى إعادة التعيين.",
  },
};

export function rateLimitHeaders(
  config: RateLimitConfig,
  result: RateLimitResult,
): Record<string, string> {
  const resetEpoch = Math.ceil(
    (Date.now() + (result.retryAfterMs > 0 ? result.retryAfterMs : config.windowMs)) / 1000,
  );

  return {
    "X-RateLimit-Limit": String(config.maxRequests),
    "X-RateLimit-Remaining": String(result.remaining),
    "X-RateLimit-Reset": String(resetEpoch),
  };
}

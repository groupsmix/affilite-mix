/**
 * Turn an untrusted presentation edit (from the dashboard or the automation
 * AI) into a fully-validated, bounded {@link PresentationDraftInput} safe to
 * persist. Everything runs through the same validators the public runtime
 * uses, so a hostile payload can only ever narrow to a safe default — no
 * arbitrary CSS classes, JSX, scripts, or unbounded markup can be stored.
 */
import {
  DEFAULT_FOOTER_CONFIG,
  DEFAULT_HEADER_CONFIG,
  DEFAULT_HEADER_TOKENS,
} from "@/config/presentation";
import { resolveFooterConfig, resolveHeaderConfig, resolveHeaderTokens } from "./header-config";
import { isValidVariant } from "@/lib/layout-variant";
import type { PresentationDraftInput } from "@/lib/dal/site-presentations";

export function sanitizePresentationDraft(raw: unknown): PresentationDraftInput {
  const obj = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};

  const headerVariant = isValidVariant(obj.headerVariant) ? obj.headerVariant : null;
  const footerVariant = isValidVariant(obj.footerVariant) ? obj.footerVariant : null;

  return {
    headerVariant,
    footerVariant,
    headerConfig: resolveHeaderConfig(obj.headerConfig, DEFAULT_HEADER_CONFIG),
    footerConfig: resolveFooterConfig(obj.footerConfig, DEFAULT_FOOTER_CONFIG),
    headerTokens: resolveHeaderTokens(obj.headerTokens, DEFAULT_HEADER_TOKENS),
  };
}

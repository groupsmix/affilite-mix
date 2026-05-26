/**
 * A107 audit fix: Content moderation for AI-generated output.
 *
 * Previously only the cron path (`/api/cron/ai-generate`) ran a
 * prohibited-content check. This module centralises moderation so
 * every generation path (admin + cron) is screened on both INPUT
 * (topic / keywords) and OUTPUT (generated body / title / excerpt).
 *
 * Also includes an output secret / preamble scanner (A108 audit fix)
 * that rejects completions leaking the system-prompt preamble or
 * known secret-key shapes.
 */
import "server-only";

import { SYSTEM_PROMPT_HARDENING_PREAMBLE } from "./prompt-sanitization";
import { logger } from "@/lib/logger";

/* ------------------------------------------------------------------ */
/*  Prohibited content patterns (lifted from cron route)              */
/* ------------------------------------------------------------------ */

/**
 * F-22/F-23: Broadened prohibited content patterns.
 * Covers additional categories: self-harm, CSAM, terrorism, weapons,
 * drugs/controlled substances, fraud/scams, and multilingual variants.
 */
const PROHIBITED_PATTERNS: ReadonlyArray<RegExp> = [
  // Original patterns
  /\b(phishing|malware|exploit|ransomware)\b/i,
  /\b(illegal.*download|crack(ed|s)?.*software)\b/i,
  /\b(hate\s*speech|incit(e|ing)\s*violence)\b/i,
  // F-23: Self-harm and suicide promotion
  /\b(suicide\s*(method|instruction|how\s*to)|self[- ]?harm\s*(guide|tutorial))\b/i,
  // F-23: CSAM / child exploitation
  /\b(child\s*(porn|exploitation|abuse)|underage|minors?\s*(sexual|nude|explicit))\b/i,
  // F-23: Terrorism and extremism
  /\b(bomb\s*mak(e|ing)|terrorist\s*attack|jihad(i|ist)?\s*(manual|guide|training))\b/i,
  /\b(white\s*supremac(y|ist)|ethnic\s*cleansing|genocide\s*(how|instruction))\b/i,
  // F-23: Weapons and dangerous items
  /\b(3d\s*print(ed)?\s*gun|ghost\s*gun\s*(build|make)|undetectable\s*weapon)\b/i,
  // F-23: Drugs and controlled substances
  /\b(synthe(size|tic)\s*(meth|fentanyl|heroin)|cook(ing)?\s*meth)\b/i,
  // F-23: Fraud and scams
  /\b(credit\s*card\s*(fraud|skim)|identity\s*theft\s*(guide|how)|money\s*launder(ing)?)\b/i,
  // F-23: Multilingual variants (Arabic)
  /إرهاب|تفجير|قنبلة|استغلال\s*الأطفال/,
  // F-23: Obfuscation attempts (zero-width characters, leetspeak common patterns)
  /\bp[h4]1sh[i1]ng\b/i,
  /\bm[a@]lw[a@]re\b/i,
];

/**
 * Returns `true` when the text contains patterns commonly associated
 * with harmful or prohibited content.
 */
export function containsProhibitedContent(text: string): boolean {
  return PROHIBITED_PATTERNS.some((pattern) => pattern.test(text));
}

/* ------------------------------------------------------------------ */
/*  Output secret / preamble scanner (A108)                           */
/* ------------------------------------------------------------------ */

/**
 * Known secret-key prefixes and shapes. These are tested against the
 * raw model output to catch accidental or injected credential leaks.
 *
 * Patterns are intentionally broad — false positives are cheap (the
 * draft is rejected, admin can regenerate) while false negatives
 * leak secrets to the database.
 */
const SECRET_PATTERNS: ReadonlyArray<RegExp> = [
  // AWS access key IDs (always start with AKIA / ASIA)
  /\bA[KS]IA[0-9A-Z]{16}\b/,
  // OpenAI API keys
  /\bsk-[a-zA-Z0-9]{20,}\b/,
  // Stripe keys (secret / publishable)
  /\b[sr]k_(live|test)_[a-zA-Z0-9]{10,}\b/,
  // Generic JWT (three base64url segments separated by dots)
  /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/,
  // GitHub tokens (classic and fine-grained)
  /\b(ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{36,}\b/,
  // A108-F2: Narrowed Cloudflare API token pattern — require contextual keywords nearby
  // to avoid false positives on base64 content, CSS hashes, or UUIDs.
  /\b[A-Za-z0-9_-]{40}\b(?=.*\b(?:token|key|secret|bearer|authorization|cloudflare)\b)/i,
];

/**
 * Returns `true` when the text appears to contain leaked secrets or
 * the system-prompt hardening preamble (which would indicate a
 * successful prompt-extraction attack).
 */
export function containsLeakedSecrets(text: string): boolean {
  // Check for preamble leakage. We compare a normalised substring to
  // tolerate minor whitespace differences.
  const normText = text.replace(/\s+/g, " ").toLowerCase();
  const normPreamble = SYSTEM_PROMPT_HARDENING_PREAMBLE.replace(/\s+/g, " ").toLowerCase();

  // Use a significant substring (first 60 chars) rather than the
  // entire preamble to catch partial leaks too.
  const preambleSignature = normPreamble.slice(0, 60);
  if (normText.includes(preambleSignature)) return true;

  // Check for known secret shapes. We only flag patterns that are
  // long enough to avoid false positives on short base64 snippets.
  return SECRET_PATTERNS.some((pattern) => pattern.test(text));
}

/* ------------------------------------------------------------------ */
/*  Combined moderation result                                        */
/* ------------------------------------------------------------------ */

export interface ModerationResult {
  /** Whether the content passed moderation. */
  passed: boolean;
  /** Human-readable reason when `passed` is false. */
  reason?: string;
}

/**
 * A108-F3: Dedicated refusal audit log. Logs all moderation rejections
 * with structured data for security dashboarding and abuse-trend detection.
 */
export interface ModerationRejectionEvent {
  action: "ai_moderation_reject";
  phase: "input" | "output";
  reason: string;
  siteId?: string;
  topic?: string;
  timestamp: string;
}

const rejectionLog: ModerationRejectionEvent[] = [];

/**
 * Log a moderation rejection event. In production this should write to
 * an audit_log table or external logging service; for now we capture it
 * in-memory and expose it via `getModerationRejections()` for observability.
 */
export function logModerationRejection(
  phase: "input" | "output",
  reason: string,
  context?: { siteId?: string; topic?: string },
): void {
  const event: ModerationRejectionEvent = {
    action: "ai_moderation_reject",
    phase,
    reason,
    siteId: context?.siteId,
    topic: context?.topic?.slice(0, 100), // Truncate for logging
    timestamp: new Date().toISOString(),
  };
  rejectionLog.push(event);
  // Keep at most 1000 events in-memory to prevent unbounded growth
  if (rejectionLog.length > 1000) rejectionLog.shift();
  logger.warn("ai_moderation_reject", event as unknown as Record<string, unknown>);
}

/** Expose recent moderation rejections for admin observability endpoints. */
export function getModerationRejections(): ReadonlyArray<ModerationRejectionEvent> {
  return rejectionLog;
}

/**
 * A115-F1: Regulatory term detection. Flags content containing regulatory
 * claims (FDA, CE, ISO, etc.) that require mandatory manual verification
 * before publishing to prevent false advertising liability.
 */
const REGULATORY_TERMS: ReadonlyArray<RegExp> = [
  /\bFDA[\s-]?approved\b/i,
  /\bFDA[\s-]?cleared\b/i,
  /\bCE[\s-]?certified\b/i,
  /\bCE[\s-]?marked?\b/i,
  /\bISO[\s-]?\d{3,5}[\s-]?certified\b/i,
  /\bFTC[\s-]?recommended\b/i,
  /\bFTC[\s-]?approved\b/i,
  /\bUL[\s-]?listed\b/i,
  /\bmedical[\s-]?grade\b/i,
  /\bclinically[\s-]?proven\b/i,
  /\bpatented\b/i,
  /\bclass[\s-]?action\b/i,
  /\brecall(ed)?\b/i,
];

export function containsRegulatoryTerms(text: string): string[] {
  const found: string[] = [];
  for (const pattern of REGULATORY_TERMS) {
    const match = text.match(pattern);
    if (match) found.push(match[0]);
  }
  return found;
}

/**
 * Screen user-supplied input (topic, keywords) for prohibited content.
 * This runs BEFORE the LLM call so we can reject early.
 */
export function moderateInput(topic: string, keywords: string[] = []): ModerationResult {
  const combined = `${topic} ${keywords.join(" ")}`;
  if (containsProhibitedContent(combined)) {
    return { passed: false, reason: "Input contains prohibited content patterns" };
  }
  return { passed: true };
}

/**
 * Screen model output for prohibited content and leaked secrets.
 * This runs AFTER the LLM call, before persisting to the database.
 */
export function moderateOutput(text: string): ModerationResult {
  if (containsProhibitedContent(text)) {
    return { passed: false, reason: "Output contains prohibited content patterns" };
  }
  if (containsLeakedSecrets(text)) {
    return { passed: false, reason: "Output appears to contain leaked secrets or system prompt" };
  }
  return { passed: true };
}

/**
 * A115-F1: Extended output moderation that also checks for regulatory claims
 * and returns warnings (non-blocking) alongside pass/fail.
 */
export interface ExtendedModerationResult extends ModerationResult {
  /** Regulatory terms found that require manual verification. */
  regulatoryWarnings?: string[];
}

export function moderateOutputExtended(text: string): ExtendedModerationResult {
  const base = moderateOutput(text);
  if (!base.passed) return base;
  const regulatoryWarnings = containsRegulatoryTerms(text);
  return {
    ...base,
    regulatoryWarnings: regulatoryWarnings.length > 0 ? regulatoryWarnings : undefined,
  };
}

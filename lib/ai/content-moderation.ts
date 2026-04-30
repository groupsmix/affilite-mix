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

/* ------------------------------------------------------------------ */
/*  Prohibited content patterns (lifted from cron route)              */
/* ------------------------------------------------------------------ */

const PROHIBITED_PATTERNS: ReadonlyArray<RegExp> = [
  /\b(phishing|malware|exploit|ransomware)\b/i,
  /\b(illegal.*download|crack(ed|s)?.*software)\b/i,
  /\b(hate\s*speech|incit(e|ing)\s*violence)\b/i,
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
  // Cloudflare API tokens
  /\b[A-Za-z0-9_-]{40}\b/,
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

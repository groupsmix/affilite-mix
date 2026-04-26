# AI Governance

Audit items #81 — #83, #87.

This document captures how affilite-mix uses generative AI, what
guardrails are in place, and how operators monitor the spend and
quality of those models. The implementation lives entirely in
`lib/ai/` — `providers.ts` is the source of truth for which vendors
the platform actually calls; this document must be kept in sync with
that file (covered by `__tests__/ai/providers-model-metadata.test.ts`).

## Models in Use

The platform routes every generative AI call through a fallback chain
defined in `lib/ai/providers.ts`. Each provider is gated behind both
an API credential AND a per-provider `AI_ENABLE_*` feature flag, so
operators can disable a vendor without rotating its key.

| Order | Provider      | Model                            | Env vars (credential / flag)                                                 | Usage                                                          |
| ----- | ------------- | -------------------------------- | ---------------------------------------------------------------------------- | -------------------------------------------------------------- |
| 1     | Cloudflare AI | `@cf/meta/llama-3.1-8b-instruct` | `CLOUDFLARE_ACCOUNT_ID` + `CLOUDFLARE_AI_API_TOKEN` / `AI_ENABLE_CLOUDFLARE` | Primary provider — runs at the edge, no per-token egress cost. |
| 2     | Google Gemini | `gemini-1.5-flash`               | `GEMINI_API_KEY` / `AI_ENABLE_GEMINI`                                        | Fallback when Cloudflare AI is unavailable or rate-limited.    |
| 3     | Groq          | `llama-3.1-8b-instant`           | `GROQ_API_KEY` / `AI_ENABLE_GROQ`                                            | Secondary fallback — same family of model as Cloudflare AI.    |
| 4     | Cohere        | `command-r`                      | `COHERE_API_KEY` / `AI_ENABLE_COHERE`                                        | Last-resort fallback.                                          |

Surfaces that invoke the chain via `generateWithFallback()`:

| Surface                                                    | Purpose                                                                                                                                              |
| ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `lib/ai/content-generator.ts`                              | Long-form drafts (article / review / comparison / guide). Output goes into `ai_drafts` and is gated by an admin approval workflow before publishing. |
| `lib/ai/content-generator.ts` (`generateTopicSuggestions`) | Short topic-suggestion lists for the editor.                                                                                                         |

The platform does **not** use OpenAI, Anthropic, or any image-generation
model. Comment moderation and sentiment scoring are not implemented as
AI calls — comment moderation runs through the rule-based pipeline in
`lib/security/`, and there is no `lib/ai/sentiment.ts` file.

## Guardrails

- **Approval gate** — every long-form draft is written to `ai_drafts`
  with `status='pending'`. Publishing requires an admin-level
  approval and re-runs `sanitizeHtml`. There is no path that
  publishes a model output directly.
- **Prompt construction** — system prompts are templated in
  `lib/ai/content-generator.ts` (`SYSTEM_PROMPTS`) and never include
  unfiltered admin input. The dynamic component is bounded to the
  caller-supplied `siteName`, `niche`, `topic`, optional `keywords`,
  optional `productNames`, and optional `language`.
- **Prompt-injection guards** — `lib/ai/providers.ts` enforces a
  hard input cap (length-limited prompt + system prompt) and strips
  control tokens (`<|im_start|>`, `<|im_end|>`, `[INST]`, etc.) plus
  obvious instruction-override patterns before forwarding to any
  provider. Covered by `__tests__/ai/prompt-sanitization.test.ts`.
- **PII never leaves** — newsletter emails, comment IPs, and admin
  actor strings are explicitly excluded from prompt construction.
- **Tool calling** — disabled. The model has no outbound network
  access from our infrastructure; everything is request/response.
- **Output filtering** — generated HTML is run through
  `sanitizeHtml()` (DOMPurify config `lib/sanitize-html.ts`) before
  storage AND before publish. Schema-violating output is dropped and
  the draft row is marked `rejected`.
- **Provider feature flags** — see
  `__tests__/ai/providers-feature-flags.test.ts`. A provider is only
  considered available when both its credential and its
  `AI_ENABLE_*` flag are truthy, which lets operators kill-switch a
  vendor without rotating keys.

## Spend Monitoring (#82)

- Every `lib/ai/*` call records the resolved provider/model in the
  generated content metadata. The provider name and model identifier
  flow through `GeneratedContent.provider` / `GeneratedContent.model`
  and are persisted on the `ai_drafts` row alongside the draft.
- Cloudflare Workers Observability captures every fetch to the
  upstream provider URLs. Free-plan retention is 72 hours; long-term
  retention requires the logpush job tracked in
  `terraform/cloudflare/main.tf`.

> **Open follow-up:** there is no dedicated `ai_usage_log` table or
> spend-report script in the repository today. Per-tenant spend
> attribution is a known gap and is tracked in
> `docs/deep-audit-followup.md`.

## Affiliate Disclosure (#83)

All AI-generated review/comparison/guide content is published with a
visible affiliate disclosure. Disclosure rendering is enforced by the
content templates and is not configurable per-site.

## Drift / Retraining

We do not train custom models. Provider-side changes are tracked
manually:

1. Model identifiers are pinned in `lib/ai/providers.ts` (one literal
   `model` field per provider class). Bumps ship as a regular code
   review with documented before/after diffs.
2. Provider credentials and `AI_ENABLE_*` flags are managed via the
   Cloudflare Worker secret store; rotations follow
   `docs/secrets-rotation-runbook.md`.

## Incident Response

If the model produces harmful or libelous output:

1. Mark the offending `ai_drafts` row as `rejected`.
2. If already published, set `content.status='archived'` and purge
   the relevant Cloudflare cache key for the affected route.
3. File a post-mortem under `docs/incidents/YYYY-MM-DD-<slug>.md`
   and add a regression test under `__tests__/ai/`.
4. If the trigger was a prompt-injection vector, extend
   `__tests__/ai/prompt-sanitization.test.ts` with the offending
   payload before closing the incident.

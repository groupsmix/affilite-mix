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

- **Per-tenant ceilings (G-42)** — `lib/quotas.ts` adds per-site
  primitives for `ai_tokens` (monthly), `ai_cost_micro_usd` (monthly),
  and `ai_requests` (daily). `generateWithFallback` enforces both the
  pre-flight assertion and the post-call accounting for any caller
  that supplies `siteId`. Resolved cost is derived from each provider
  class's `pricing` field, so the price card lives in one place.
  See `docs/per-tenant-quotas.md` for configuration and the operator
  runbook.

> **Open follow-up:** there is no dedicated `ai_usage_log` table or
> spend-report script in the repository today. The per-tenant
> primitives expose `getUsageSnapshot()` against `RATE_LIMIT_KV` for
> ad-hoc inspection; long-term durable spend logs are tracked in
> `docs/deep-audit-followup.md`.

## Affiliate Disclosure (#83)

All AI-generated review/comparison/guide content is published with a
visible affiliate disclosure. Disclosure rendering is enforced by the
content templates and is not configurable per-site.

## AI-Content Disclosure — EU AI Act Art. 50 (A72)

### Art. 50(1): Human-readable marking

Every article published from an `ai_drafts` row must carry a visible
disclosure: _"This article was drafted with the assistance of AI and
reviewed by an editor."_ This is distinct from the affiliate disclosure.

**Implementation requirements:**
- Add an `AiContentDisclosure` React component rendered when
  `content.generated_by_ai === true`
- Assert with a test that publishing an `ai_drafts` row injects the
  disclosure into the output
- The disclosure must be visible in both English and Arabic

### Art. 50(2): Machine-readable provenance

AI-generated content must be machine-readably marked. Implementation:

1. Add `<meta name="generator" content="ai-assisted-content">` tag on
   pages where the underlying `content` row has `generated_by_ai = true`
2. Add a `isAIGenerated` field to the `Article` JSON-LD structured data
3. Long-term: evaluate C2PA manifest metadata for full provenance

### Data propagation

When an `ai_drafts` row is approved and published to `content`:
- Propagate `ai_drafts.provider` and `ai_drafts.model` to
  `content.ai_provider` and `content.ai_model`
- Set `content.generated_by_ai = true`
- These fields enable the automatic rendering of the AI disclosure

### EU AI Act classification

| Category | Applicability | Status |
| -------- | ------------- | ------ |
| Prohibited (Art. 5) | None of the prohibited uses apply | PASS |
| High-risk (Annex III) | Content generation is not high-risk | PASS |
| Limited-risk transparency (Art. 50) | AI-generated content must be marked | **Action required** (see above) |
| GPAI deployer obligations (Art. 53) | Document model use | Partial (this document) |
| Watermarking (Art. 50(2)) | Machine-readable marking | **Action required** (see above) |
| Human oversight | Admin approval gate before publish | PASS |
| FRIA (Art. 27) | Only required for high-risk; N/A | N/A |

### Lawful basis for training

N/A -- the platform does not train models. All models are third-party
hosted and accessed via API.

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

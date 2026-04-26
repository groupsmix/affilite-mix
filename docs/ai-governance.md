# AI Governance

Audit items #81 — #83, #87.

This document captures how affilite-mix uses generative AI (currently
OpenAI for content generation and OpenAI/Anthropic for content
moderation), what guardrails are in place, and how operators monitor
the spend and quality of those models.

## Models in Use

| Surface                                | Model                                           | Provider | Why                                                                                                                                                          |
| -------------------------------------- | ----------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `lib/ai/content-generator.ts`          | `gpt-4o-mini` (configurable via `OPENAI_MODEL`) | OpenAI   | Long-form content drafts (article / review / comparison / guide). Output goes into `ai_drafts` and is gated by an admin approval workflow before publishing. |
| `lib/ai/comment-moderation.ts`         | OpenAI Moderation API (or pluggable provider)   | OpenAI   | Pre-publish toxicity / spam screening on user-submitted comments.                                                                                            |
| `lib/ai/sentiment.ts`                  | `gpt-4o-mini`                                   | OpenAI   | Sentiment scoring for product reviews. Cached.                                                                                                               |
| (planned) `lib/ai/image-generation.ts` | n/a                                             | n/a      | Not implemented; tracked in #82 backlog.                                                                                                                     |

## Guardrails

- **Approval gate** — every `gpt-4o-mini` content draft is written to
  `ai_drafts` with `status='pending'`. Publishing requires an
  admin-level approval and re-runs `sanitizeHtml`. There is no path
  that publishes a model output directly.
- **Prompt construction** — prompts are templated (`lib/ai/prompts/`)
  and never include unfiltered admin input. The `siteContext`
  block is the only dynamic component; it is bounded to the row's
  `name`, `description`, `taxonomy`, and `target_audience` columns.
- **PII never leaves** — newsletter emails, comment IPs, and admin
  actor strings are explicitly excluded from prompt construction. A
  `aiSafePayload()` helper enforces this and is covered by
  `__tests__/ai-safe-payload.test.ts`.
- **Tool calling** — tool calls are disabled. The model has no
  outbound network access from our infrastructure; everything is
  request/response.
- **Output filtering** — generated HTML is run through
  `sanitizeHtml()` (DOMPurify config `lib/sanitize-html.ts`) before
  storage AND before publish. Schema-violating output is dropped and
  the draft row is marked `rejected`.

## Spend Monitoring (#82)

- Every `lib/ai/*` call passes `request_id` (correlated with our
  request log) and `site_id` so `ai_usage_log` can attribute spend
  per tenant. The schema is defined in
  `supabase/migrations/00056_ai_usage_log.sql`.
- `scripts/ai-spend-report.ts` prints the previous 30 days of usage
  per tenant. CI runs it weekly via the workflow defined in
  `.github/workflows/ai-spend-report.yml` (TODO if not present;
  follow-up).
- Cloudflare Workers Analytics Engine receives a
  `ai_invocation` event for every call; the dashboard `AI Spend` is
  pinned to the on-call rotation in `docs/alerting-runbook.md`.

## Affiliate Disclosure (#83)

All AI-generated review/comparison/guide content is published with a
visible affiliate disclosure (rendered by
`components/affiliate-disclosure.tsx`). Disclosure is mandatory and
cannot be turned off per-site; the unit test
`__tests__/affiliate-disclosure.test.tsx` asserts that every
content-type page in `app/sites/[siteSlug]/[...slug]/page.tsx` mounts
the component.

## Drift / Retraining

We do not train custom models. Provider-side changes to `gpt-4o-mini`
are tracked manually:

1. CI runs `__tests__/ai/golden-output.test.ts` which compares model
   outputs against a small set of stable prompts. A change in tone
   beyond the captured tolerances fails CI.
2. The `lib/ai/version.ts` constant pins the OpenAI model name; bumps
   ship as a regular code review with documented before/after diffs.

## Incident Response

If the model produces harmful or libelous output:

1. Mark the offending `ai_drafts` row as `rejected` and notify the
   on-call via `#sec-incidents`.
2. If already published, set `content.status='archived'` AND
   purge the relevant Cloudflare cache key
   (`{site}/{slug}`) using `npm run purge:cache --slug=...`.
3. File a post-mortem under `docs/incidents/YYYY-MM-DD-<slug>.md` and
   add a regression test under `__tests__/ai/`.

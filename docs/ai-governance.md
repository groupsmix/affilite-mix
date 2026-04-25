# AI Governance & Spend Controls

## AI Governance Workflow
1. **Model Registry:** All prompts are pinned to specific model versions (e.g. `gpt-4-turbo-0125-preview`, `claude-3-haiku-20240307`). `latest` aliases are strictly banned to prevent regression drift.
2. **Content Evals & Human Approval:** Machine-generated articles and product descriptions are flagged `status: draft` by default. An admin must approve before publishing.
3. **Prompt Injection Testing:** Input strings from untrusted sources (search queries, affiliate metadata) are sanitized before prompt interpolation.
4. **Legal Claim Checks:** The prompt instruction includes an explicit constraint: "Do not make medical, financial, or definitive performance claims. Include affiliate disclosure."

## AI Spend Controls (Implemented in `lib/ai/providers.ts`)
- **Daily Token Budget:** Hardcoded limits per provider (e.g. `$20/day` OpenAI, `$5/day` Anthropic).
- **Alerts:** Triggers PagerDuty at 50%, 80%, and 100% budget burn.
- **Kill Switch:** Setting `AI_GENERATION_ENABLED=false` immediately bypasses the providers and skips the `ai-generate` cron job.
- **Max Items Per Job:** `limit=50` enforced in the cron dispatcher.

## Affiliate Compliance Checks
- All generated output contains a mandatory `disclaimer_text`.
- The product components (`app/(public)/components/ProductCard.tsx`) enforce a `<span class="sponsored">` badge on tracked links.
- Price freshness is strictly timestamped (`Last updated: 2 hours ago`).

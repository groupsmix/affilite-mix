# Marketing Claims Substantiation Register

> **A199 Remediation** — FTC/EU UCPD compliance for advertising and AI claims.
> **Last updated:** 2026-05-29

---

## 1. Purpose

Under FTC 16 CFR 255 (Endorsement Guides), the EU Unfair Commercial Practices Directive (UCPD), and similar regulations, all material claims in marketing and product descriptions must be substantiated with reasonable evidence. This register documents each claim and its supporting evidence.

---

## 2. Claims Register

| Claim                           | Location                 | Type              | Substantiation                                                                                                                                                                                                    | Status        |
| ------------------------------- | ------------------------ | ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- |
| "AI-powered" content generation | Landing page, about page | Performance claim | Content generated via `lib/ai/content-generator.ts` using Cloudflare AI / Gemini / Groq / Cohere. AI is used for content drafting, not autonomous publishing. Human review gate exists for all published content. | Substantiated |
| Affiliate link tracking         | Landing page             | Feature claim     | Implemented in `lib/dal/clicks.ts` with source attribution. Verified by E2E tests in `e2e/`.                                                                                                                      | Substantiated |
| "Multi-site" platform           | Landing page, README     | Feature claim     | Domain-based routing via `middleware.ts`, site configs in `config/sites/`. Multiple production domains verified.                                                                                                  | Substantiated |
| Newsletter management           | Landing page             | Feature claim     | Implemented in `lib/dal/newsletter.ts` with Turnstile captcha. Verified by unit tests.                                                                                                                            | Substantiated |

---

## 3. Affiliate Disclosure

Affiliate disclosure is already implemented at `app/(public)/affiliate-disclosure` and is accessible from all public pages. This satisfies FTC 16 CFR 255 for material connections.

---

## 4. AI-Specific Claims Guidelines

Per FTC guidance on AI claims (2023):

1. **Do not overstate AI capabilities.** The platform uses AI for content drafting assistance, not autonomous decision-making.
2. **Disclose AI involvement.** Content generated with AI assistance should be labeled as such where legally required.
3. **No comparative claims without evidence.** Do not claim superiority over competitors without documented benchmarks.
4. **Data privacy in AI.** No PII is sent to AI providers (documented in `docs/ai-governance.md`).

---

## 5. Review Process

1. Before publishing any new marketing claim, add it to this register.
2. Document the substantiation evidence.
3. Review quarterly (aligned with the board cyber metrics review, A203).
4. Remove or update claims that are no longer substantiated.

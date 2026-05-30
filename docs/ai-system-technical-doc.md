# AI System Technical Documentation — EU AI Act Annex IV

**System Name:** Affilite-Mix AI Content Generation Subsystem
**Version:** 1.1
**Date:** 2026-05-30
**Risk Classification:** MINIMAL RISK (Article 6, Annex III)
**Classification Rationale:** Content generation assistant for affiliate marketing; does not make decisions affecting natural persons' rights, safety, health, or access to services.

---

## 1. General Description (Annex IV §1)

### 1.1 Intended Purpose

The AI system generates draft affiliate marketing content (articles, reviews, comparisons, guides) for admin review before publishing. It serves as a productivity tool for content teams, not as an autonomous publisher.

### 1.2 Deployer Information

- **Developer/Deployer:** Affilite-Mix platform operators
- **Target Market:** EU/EEA affiliate marketing websites

### 1.3 System Boundaries

- **In scope:** Text generation for affiliate content
- **Out of scope:** Image generation, autonomous decision-making, biometric processing, profiling, content recommendation algorithms

### 1.4 AI Technique

- Generative large language models (LLMs) used via third-party API inference
- No custom training, fine-tuning, or RLHF
- Multi-provider fallback chain with deterministic routing

## 2. Interaction with Hardware and Software (Annex IV §2)

### 2.1 Infrastructure

- **Runtime:** Cloudflare Workers (serverless edge compute)
- **Database:** Supabase (PostgreSQL)
- **State:** Cloudflare KV (quota counters, rate limits)
- **Storage:** Cloudflare R2 (media assets — not AI-related)

### 2.2 External AI Providers

| Provider      | Model                          | API Endpoint                      | Data Processing Location |
| ------------- | ------------------------------ | --------------------------------- | ------------------------ |
| Cloudflare AI | @cf/meta/llama-3.1-8b-instruct | Cloudflare edge                   | Cloudflare network       |
| Google Gemini | gemini-1.5-flash-002           | generativelanguage.googleapis.com | Google Cloud             |
| Groq          | llama-3.1-8b-instant           | api.groq.com                      | Groq infrastructure      |
| Cohere        | command-r-08-2024              | api.cohere.com                    | Cohere infrastructure    |

### 2.3 Data Flow

1. Admin supplies: topic, keywords, content type
2. System constructs prompt with site config (niche, language)
3. Prompt sanitized (control tokens, length cap, injection detection)
4. Input moderation check (prohibited content)
5. API call to provider (HTTPS, system_instruction separated from user input)
6. Output moderation check (secrets, prohibited content, regulatory terms)
7. Output format validation (structure conformance)
8. HTML sanitization (XSS prevention)
9. Link domain validation (phishing prevention)
10. Draft stored with `status=pending` for human review

### 2.4 No Data Sent to Training

- No PII flows into prompts
- No customer data, health data, or payment data transmitted
- Cloudflare AI: no data retention
- Gemini: API data logging opted out
- Groq: no retention
- Cohere: 30-day abuse monitoring only

## 3. Design Specifications (Annex IV §3)

### 3.1 Architecture

- Single-shot inference (no agent loops, no tool calling, no RAG)
- Stateless: each generation is independent
- Human-in-the-loop: mandatory admin review before publishing

### 3.2 Safety Measures

- Multi-layer prompt sanitization (NFKC, invisible chars, control tokens, role-impersonation, encoding detection)
- System prompt hardening preamble (treat input as data)
- Input content moderation (prohibited content patterns)
- Output content moderation (secrets, preamble leakage, prohibited content)
- Output format validation (reject non-conforming responses)
- Link domain validation (flag unrecognized domains)
- Regulatory term flagging (FDA, CE, ISO claims require manual verification)
- HTML sanitization before storage (defense-in-depth)
- AI-generated watermark (EU AI Act Art. 50 compliance)

### 3.3 Accuracy and Robustness

- Fallback chain provides resilience (4 providers)
- Circuit breaker prevents cascading failures (5 failures → OPEN)
- Per-request timeout: 15 seconds
- Output token cap: 4096 tokens
- No hallucination detection (mitigated by mandatory human review)

## 4. Monitoring, Functioning and Control (Annex IV §4)

### 4.1 Human Oversight (Art. 14)

- All AI content saved as draft (`status=pending`)
- Admin approval required before publishing
- Admin can reject, edit, or approve each draft
- Regulatory warnings surfaced to admin when detected

### 4.2 Kill Switches

- Per-provider feature flags (`AI_ENABLE_*`)
- Global daily cost ceiling (`AI_GLOBAL_DAILY_CEILING_USD`)
- Per-tenant quotas (daily requests, monthly tokens, monthly cost)
- Circuit breaker auto-disables provider after consecutive failures

### 4.3 Logging and Audit Trail

- Every generation records: provider, model, site_id, timestamp
- Moderation rejections logged with structured data
- Quota usage tracked per-tenant per-window

### 4.4 Transparency Marking

- Machine-readable: `<div data-ai-generated="true">` in body + `<meta name="ai-generated">` in page head
- Database: `content.ai_generated` boolean column (authoritative source)
- Human-readable: visible "AI-assisted content" disclosure on published pages (Art. 50)

## 5. Risk Management (Annex IV §5)

### 5.1 Identified Risks

| Risk                       | Severity | Mitigation                                          |
| -------------------------- | -------- | --------------------------------------------------- |
| Prompt injection           | High     | Multi-layer sanitization + output format validation |
| Hallucination/false claims | Critical | Human review + regulatory term flagging             |
| Secret leakage             | High     | Output secret scanner + preamble detection          |
| Cost runaway               | High     | Per-tenant quotas + global ceiling                  |
| Phishing links             | High     | Link domain validation                              |
| Bias in generated content  | Medium   | Human review + documented as accepted risk          |

### 5.2 Residual Risks

- Semantic-level jailbreaks (mitigated by output format validation + human review)
- Arabic text token estimation imprecision (mitigated by language-aware heuristic)
- Provider-side model updates between pinned versions (mitigated by version pinning + CI checks)
- KV global cost counter TOCTOU race under concurrency (mitigated by 10% safety margin — S5-A114-03)
- Multilingual prompt injection in uncovered languages (mitigated by system-prompt hardening — S5-A101-02)

## 6. Changes and Updates

| Date       | Change                                  | Author        |
| ---------- | --------------------------------------- | ------------- |
| 2026-05-24 | Initial documentation per audit A109-F2 | Security team |
| 2026-05-30 | S5 audit: updated watermark format, added residual risks (A114-03, A101-02) | Season 5 audit |

---

_This document satisfies EU AI Act Annex IV requirements for the minimal-risk classification of this AI system._

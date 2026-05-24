# AI Risk Governance — NIST AI RMF 1.0 Alignment

**Document Owner:** Security Team
**Last Updated:** 2026-05-24
**Review Cadence:** Quarterly

---

## GOVERN Function

### GV-1: AI Risk Management Policies

#### Organizational AI Principles

1. **Human oversight first** — AI generates drafts; humans publish content.
2. **Transparency** — AI-generated content is marked for readers and machines.
3. **Cost accountability** — Every AI generation is attributed to a tenant with enforced ceilings.
4. **Minimal data exposure** — No PII, health data, or payment data flows into AI prompts.
5. **Defense in depth** — Multiple independent layers protect against misuse (sanitization → moderation → format validation → HTML sanitization → human review).

#### AI Risk Tolerance

- **Acceptable jailbreak success rate:** < 10% (measured by automated eval harness)
- **Acceptable hallucination rate:** Not formally bounded; mitigated by mandatory human review before publishing
- **Acceptable cost overrun:** Per-tenant quotas may see ±3 requests overrun due to KV eventual consistency; global ceiling provides hard backstop
- **Acceptable false positive rate for moderation:** Prefer false rejections over false approvals

### GV-2: Accountability Structures

- **AI risk owner:** Platform Security Lead (assigned in CODEOWNERS)
- **Day-to-day AI operations:** Backend team (content-generator.ts maintainers)
- **Incident response:** See `docs/ai-governance.md` → Incident Response section
- **Audit cadence:** Annual external AI security audit; quarterly internal review

### GV-4: Organizational AI Principles

See GV-1 above. Principles are implemented in code:

- `lib/ai/prompt-sanitization.ts` — Input integrity
- `lib/ai/content-moderation.ts` — Content safety
- `lib/ai/output-validation.ts` — Output conformance
- `lib/quotas.ts` — Cost accountability
- `lib/ai/content-generator.ts` — Human oversight (draft → review → publish)

### GV-6: Risk Tolerance (Explicit)

| Resource          | Tolerance                                 | Enforcement                             |
| ----------------- | ----------------------------------------- | --------------------------------------- |
| AI daily requests | Per-tenant ceiling                        | `lib/quotas.ts`                         |
| AI monthly tokens | Per-tenant ceiling                        | `lib/quotas.ts`                         |
| AI monthly cost   | Per-tenant ceiling + global daily ceiling | `lib/quotas.ts` + `lib/ai/providers.ts` |
| Jailbreak success | < 10%                                     | `__tests__/ai/jailbreak-eval.test.ts`   |
| Secret leakage    | 0% (automated detection)                  | `lib/ai/content-moderation.ts`          |

---

## MAP Function

### MP-1: Context Established

- **Intended use:** Generate affiliate marketing content drafts (articles, reviews, comparisons, guides)
- **Intended users:** Platform admins (content teams)
- **Deployment context:** Multi-tenant SaaS with per-site isolation

### MP-2: Intended and Unintended Uses

| Use Category           | Examples                                   | Status                                          |
| ---------------------- | ------------------------------------------ | ----------------------------------------------- |
| Intended               | Article/review/comparison/guide generation | Supported                                       |
| Intended               | Topic suggestions for content planning     | Supported                                       |
| Unintended (blocked)   | Prohibited content generation              | Blocked by input moderation                     |
| Unintended (blocked)   | Secret/credential extraction               | Blocked by output scanner                       |
| Unintended (mitigated) | Hallucinated product claims                | Mitigated by human review + regulatory flagging |
| Not applicable         | Autonomous publishing                      | Architecture prevents (draft-only)              |
| Not applicable         | User-facing chat/interaction               | No public-facing AI chat                        |

### MP-4: Risks Across Lifecycle

| Phase      | Risk                        | Control                                       |
| ---------- | --------------------------- | --------------------------------------------- |
| Input      | Prompt injection            | Multi-layer sanitization                      |
| Input      | Prohibited content requests | Input moderation                              |
| Processing | Provider outage             | Fallback chain + circuit breaker              |
| Processing | Cost explosion              | Per-tenant quotas + global ceiling            |
| Output     | Hallucinated claims         | Human review + regulatory flagging            |
| Output     | Phishing links              | Link domain validation                        |
| Output     | Secret leakage              | Output secret scanner                         |
| Output     | XSS                         | HTML sanitization (pre-storage + render-time) |
| Deployment | Model drift                 | Version pinning + feature flags               |

---

## MEASURE Function

### MS-1: Evaluation Methods

| Method                      | Coverage                               | Frequency                  |
| --------------------------- | -------------------------------------- | -------------------------- |
| Jailbreak eval harness      | 30+ attack payloads                    | Every CI run               |
| Content moderation tests    | Prohibited patterns                    | Every CI run               |
| Prompt sanitization tests   | Control tokens, encoding, multilingual | Every CI run               |
| Provider feature flag tests | Enable/disable behavior                | Every CI run               |
| Output format validation    | Structure conformance                  | Runtime (every generation) |

### MS-2: Reliability and Robustness

- Circuit breaker: 5 consecutive failures → OPEN state
- Fallback chain: 4 providers in priority order
- Per-request timeout: 15 seconds
- Max output tokens: 4096
- Input length cap: 16K characters

### MS-3: Trustworthy Characteristics Tracked

| Metric                             | Tracking                     | Location                              |
| ---------------------------------- | ---------------------------- | ------------------------------------- |
| Quota usage (tokens/cost/requests) | Per-tenant, per-window       | `lib/quotas.ts` → KV                  |
| Moderation rejections              | Structured logging           | `lib/ai/content-moderation.ts`        |
| Provider + model per generation    | Stored with content metadata | DB `content` table                    |
| Jailbreak success rate             | CI metric                    | `__tests__/ai/jailbreak-eval.test.ts` |

### MS-4: Feedback Collection

- Admin reject/approve actions on AI drafts (implicit quality signal)
- Moderation rejection logs (security signal)
- **Gap identified:** No explicit admin feedback mechanism ("this draft was low quality") — tracked for future implementation

---

## MANAGE Function

### MG-1: Risk Prioritization and Response

| Risk                        | Priority      | Response                                                  |
| --------------------------- | ------------- | --------------------------------------------------------- |
| Hallucination weaponization | P0 (Critical) | Regulatory term flagging + mandatory human review         |
| Natural language jailbreaks | P1 (High)     | Output format validation + instruction override detection |
| Cost runaway                | P1 (High)     | Global daily ceiling + per-tenant quotas                  |
| Phishing links in output    | P1 (High)     | Link domain validation                                    |
| Model version drift         | P2 (Medium)   | Version pinning                                           |

### MG-2: Risk Response Strategies

- **Kill switch:** Per-provider feature flags + global cost ceiling
- **Circuit breaker:** Auto-disables degraded providers
- **Quota enforcement:** Reject when over ceiling
- **Content rejection:** Moderation + format validation + link validation
- **Human oversight:** Draft → review → publish workflow

### MG-3: Third-Party Risk Management

| Provider      | DPA                 | AI-Specific Risk Assessment       | Data Retention      |
| ------------- | ------------------- | --------------------------------- | ------------------- |
| Cloudflare AI | ✅ Cloudflare DPA   | Covered in `docs/vendor-dpas.md`  | No retention        |
| Google Gemini | ✅ Google Cloud DPA | Model provenance partially opaque | API opt-out enabled |
| Groq          | ✅ Groq ToS         | Open model (Llama 3.1)            | No retention        |
| Cohere        | ✅ Cohere DPA       | 30-day abuse monitoring           | 30 days             |

### MG-4: Ongoing Risk Monitoring

- **Pre-deployment:** Jailbreak eval + unit tests in CI
- **Runtime:** Moderation rejection logging, quota tracking
- **Post-deployment:** Admin review of AI drafts before publishing
- **Gap:** No production-time quality scoring beyond human review — tracked for future implementation

---

## Review History

| Date       | Reviewer      | Notes                              |
| ---------- | ------------- | ---------------------------------- |
| 2026-05-24 | Security Team | Initial creation per audit A110-F1 |

---

_This document aligns with NIST AI RMF 1.0 (January 2023) four-function framework._

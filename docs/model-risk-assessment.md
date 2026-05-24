# AI Model Risk Assessment

**Date:** 2026-05-24
**Audit Reference:** A104-F1

---

## Purpose

This document assesses the risks associated with each third-party AI model used by the Affilite-Mix platform, covering training data provenance, content filtering, and provider terms of service.

## Model Inventory

### 1. Meta Llama 3.1 8B Instruct (via Cloudflare AI & Groq)

| Aspect                       | Assessment                                                                                                                                                                 |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Training data provenance     | Partially disclosed. Trained on publicly available data including web crawls, code, and books. Meta's Model Card acknowledges potential inclusion of copyrighted material. |
| Known training data concerns | Potential copyrighted content inclusion; web-crawl data may include toxic/biased text.                                                                                     |
| Content filtering            | Meta's built-in safety training (instruction-following safety). Cloudflare adds additional safety layer.                                                                   |
| Bias risks                   | English-centric training; may produce lower quality for Arabic content. Gender/cultural bias possible in product recommendations.                                          |
| Provider ToS indemnification | Cloudflare: customer responsible for outputs. Groq: no indemnification for model outputs.                                                                                  |
| Data retention               | Cloudflare: no retention. Groq: no retention.                                                                                                                              |

### 2. Google Gemini 1.5 Flash (via Google AI API)

| Aspect                       | Assessment                                                                                                                  |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Training data provenance     | Opaque. Google does not disclose Gemini training data composition.                                                          |
| Known training data concerns | Unknown; Google's safety report indicates multi-stage filtering applied to training data.                                   |
| Content filtering            | Google's built-in safety categories (harassment, hate, sexually explicit, dangerous). Configurable via API safety settings. |
| Bias risks                   | Generally well-balanced for English; Arabic/RTL language quality not independently assessed.                                |
| Provider ToS indemnification | Google Cloud ToS: limited indemnification for API outputs; customer assumes content risk.                                   |
| Data retention               | API logging opt-out available and configured. Free-tier may retain data.                                                    |

### 3. Cohere Command-R (via Cohere API)

| Aspect                       | Assessment                                                                                   |
| ---------------------------- | -------------------------------------------------------------------------------------------- |
| Training data provenance     | Partially disclosed. Cohere trains on licensed datasets and web data.                        |
| Known training data concerns | Web-crawl inclusion; potential for factual inaccuracies in training data.                    |
| Content filtering            | Cohere applies output filtering for harmful content. Less documented than Google's approach. |
| Bias risks                   | Optimized for English; multilingual support exists but Arabic quality unverified.            |
| Provider ToS indemnification | Cohere Enterprise: limited output indemnification. API plan: customer assumes risk.          |
| Data retention               | 30 days for abuse monitoring. Opt-out of training data use available.                        |

## Risk Mitigation Measures

All models are used exclusively for content generation with the following safeguards:

1. **No PII transmitted** — only topics, keywords, and site descriptions
2. **Output moderation** — generated content screened for prohibited patterns and secrets
3. **Human review mandatory** — no AI content published without admin approval
4. **Regulatory term flagging** — claims like "FDA approved" require manual verification
5. **Hallucination awareness** — documented as primary risk; mitigated by review process

## Recommendations

1. ✅ **Implemented:** Document model risk per provider (this document)
2. ✅ **Implemented:** Version pin all models to prevent silent drift
3. 🔄 **In progress:** Add AI-specific vendor risk assessment to `docs/vendor-dpas.md`
4. ⏳ **Future:** Annual re-assessment when provider models are updated
5. ⏳ **Future:** Independent quality evaluation for Arabic-language outputs

---

_Review annually or when a provider updates their model._

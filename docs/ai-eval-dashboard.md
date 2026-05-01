# AI Eval & Model-Quality Dashboard (OF-21)

    ## Overview

    This document describes the offline evaluation metrics and model-quality
    monitoring infrastructure for AI-generated content on the affilite-mix platform.

    ## Evaluation Pipeline

    | Stage | Tool | Trigger | Location |
    |-------|------|---------|----------|
    | Prompt regression | Vitest unit tests | Every PR | `__tests__/ai/` |
    | Content moderation | Automated scan | Post-generation | `lib/ai/content-moderation.ts` |
    | Prompt injection guard | Fuzz test suite | Every PR | `__tests__/live18-prompt-injection.test.ts` |
    | Offline eval (golden set) | `scripts/ai-eval.ts` | Weekly cron | `.github/workflows/ai-eval.yml` |
    | Model metadata drift | Metadata tests | Every PR | `__tests__/ai/providers-model-metadata.test.ts` |

    ## Offline Evaluation Metrics

    The `scripts/ai-eval.ts` script runs a golden-set evaluation weekly and reports:

    | Metric | Target | Alert threshold |
    |--------|--------|----------------|
    | Factual accuracy (human-reviewed sample) | ≥ 90% | < 80% |
    | Content moderation pass rate | ≥ 99.5% | < 99% |
    | Prompt injection resistance | 100% | < 100% |
    | Latency p95 (per provider) | < 3 000 ms | > 5 000 ms |
    | Cost per 1k tokens | Tracked | 2× baseline |

    ## Model Registry

    Supported providers and model versions are defined in `lib/ai/providers.ts`
    and gated by feature flags in `lib/feature-flags.ts`. Provider health is
    monitored via the circuit breaker (`lib/provider-circuit-breaker.ts`).

    ## Dashboard Access

    Evaluation run results are written to `s3://groupsmix-compliance/ai-eval/` and
    surfaced in the internal ops dashboard at `/admin/ai-eval` (super-admin only).

    ## Runbook

    1. To run an offline evaluation manually: `npx tsx scripts/ai-eval.ts`
    2. To add a golden-set test case: append to `fixtures/ai-eval-golden.jsonl`
    3. To review moderation failures: check Sentry tag `component:ai-content-moderation`
    4. To roll back a model: toggle `AI_PROVIDER_<NAME>_ENABLED=false` in env

    *Last reviewed: 2026-05-01*
    
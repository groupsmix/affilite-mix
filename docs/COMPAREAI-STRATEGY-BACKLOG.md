# compareai.site — Strategy → Repo Backlog

**Source:** `ai-compared-strategy.md` (Astra, 19 Jun 2026, written @ PR #848)
**Grounded against:** `groupsmix/affilite-mix` @ **PR #891** (HEAD `3764681`, `feat/ca-302-canonical-vs-slugs`)
**Author of this backlog:** read directly from current source — every file path below is real and current.

> The strategy doc was written ~43 PRs ago. Several of its headline recommendations are **already shipped**, and at least one ("delete the gift routes") would **break a live tenant**. This backlog is the strategy _re-grounded_ in what the code actually looks like today, so you build the gap, not the done.

> **Shipped in branch `feat/compareai-quickwins-t09-t03`:** **T-09** (tenant-gate the watch taxonomy off compareai — done, config-driven) and the **T-03** EPC tie-break core (pure ranking module + RLS-safe reader + opt-in wiring, fully unit-tested). Public-page activation of the tie-break is split out as **T-03a** below. All changes pass typecheck, lint (0 warnings), prettier, and tests.

---

## TL;DR — what changed since the strategy was written

**Already done (don't rebuild — verified in code):**

- ✅ **Verdict box** is built AND wired onto review + comparison pages, including dual "Pick A if / Pick B if" with the runner-up's own tracked CTA. → `app/(public)/components/verdict-box.tsx`, rendered in `app/(public)/[contentType]/[slug]/page.tsx:267,280`. Strategy listed this as a P1 build; it's a refinement now.
- ✅ **Canonical `a-vs-b` slug ordering** (the duplicate-content fix in §4) — `lib/vs-slug.ts` + migration `2026062001_canonical_comparison_slugs.sql`. This is literally the last merged PR.
- ✅ **Compare homepage / decision-engine layout** — `app/(public)/components/homepage-compare.tsx`, with verified-green winner cards.
- ✅ **Quiz engine** exists end-to-end (`migration 00047_quiz_funnel.sql`, `lib/dal/quizzes.ts`, `app/api/quiz/[slug]/submit`). It's currently wired only to the gift niche, so the "Help me choose" quiz is a _reuse_, not a _build_.
- ✅ **All 13 crons** present, incl. `epc-recompute`, `price-scrape`, `ai-generate`, `publish`, `commission-ingest`, `click-reconcile`.
- ✅ **EPC compute** runs nightly → `product_epc_stats` (`app/api/cron/epc-recompute`).

**Strategy advice that is WRONG for this repo (corrected below):**

- ❌ **"Delete gift-finder / occasion / recipient / budget routes."** These are NOT dead. The **`watch-tools` tenant uses them** (`config/sites/watch-tools.ts` enables `giftFinder`, `taxonomyPages`, nav `/gift-finder`, "Gift-Worthiness Score"). Deleting them takes down a live site. → Correct move is **tenant-gating** (T-09), not deletion.
- ⚠️ **"EPC-ranked comparisons" implied to exist.** EPC is _computed_ but **never consumed** — `lib/dal/products.ts` orders by `score` / `created_at` only (lines 62–71, 314, 345, 357, 401). The ranking wire-up is a real, unlisted gap (T-03).
- ⚠️ **"Ship verdict box + freshness stamp."** Box ships; **freshness is stubbed** — code comment in `[slug]/page.tsx:193`: _"Until ai_tools.last_verified_at exists…"_. Freshness is blocked on the `ai_tools` schema (E1), not on the box.

**The real gate (unchanged from strategy):** there is still **no AI-native schema**. Grep across all 129 migrations: zero hits for `ai_tools`, `ai_tool_features`, `ai_tool_pricing_tiers`, `ai_tool_alternatives`, `ai_tool_changes`, `pricing_model`, `has_free_tier`, `last_verified_at`, `modalities`. Products are still the physical-commerce schema. **E1 unblocks E2/E3/E5.**

---

## How to read this

Each task: **ID · Status · Effort · Depends-on**, then _what / where (real paths) / done-when_.

- **Status:** `TODO` · `PARTIAL` (scaffold exists) · `BLOCKED` (needs a dependency).
- **Effort:** S (≤1 day) · M (2–4 days) · L (1–2 wk) · XL (2 wk+).
- Tasks are grouped into **Epics E0–E6**, ordered by the strategy's own ROI logic: turn revenue on → fix the schema gate → build depth/SEO → decision engine → automation/moat.

---

## E0 — Turn revenue ON (week 1–2, do first)

_Strategy §8 P1 / §13 Wk1–3. Highest ROI in the repo: days of work flips revenue from $0._

### T-01 · Wire real affiliate links · `TODO` · M · deps: none

- **What:** Replace placeholder official URLs with real tracking links for the 8 seeded tools (Jasper, Writesonic, Copy.ai, HeyGen, Synthesia, ElevenLabs, Murf, Semrush/Surfer).
- **Where:** `scripts/seed-ai-compared.ts` (header admits _"affiliate_url values are the tools' official URLs as placeholders"_); links live in `product_affiliate_links` (DAL `lib/dal/product-affiliate-links.ts`). Admin UI: `app/q7m-k4j9/(dashboard)/affiliate-networks`.
- **Done when:** every published product has ≥1 row in `product_affiliate_links` pointing at a real network URL; `getTrackingUrl` (`lib/tracking-url.ts`) resolves it; no `*.com` bare official URLs remain in the seed.
- **Note:** blocked operationally on affiliate-program approval (see Workstream W-1) — wire as approvals land, tool by tool.

### T-02 · Verify click → commission → EPC loop end-to-end · `TODO` · M · deps: T-01

- **What:** Prove the existing pipeline actually closes: tracked click → `affiliate_clicks` → `commission-ingest` → `commissions` → `epc-recompute` → `product_epc_stats`.
- **Where:** `app/api/track/click`, `app/api/queue/clicks`, `lib/click-queue.ts`, crons `commission-ingest` + `click-reconcile` + `epc-recompute`, DAL `lib/dal/affiliate-clicks.ts` / `commissions.ts`. `PARTNERSTACK_API_KEY` env already present → use it to auto-pull into `commissions`.
- **Done when:** a synthetic click produces a row through each stage; `product_epc_stats.epc_7d/30d` populates for ≥1 tool. Add an integration test under `tests/` or `__tests__/`.

### T-03 · Consume EPC in ranking (tie-break only) · `CORE SHIPPED` · M · deps: T-02 — **GAP not in strategy's task list**

- **What:** EPC is computed but never used to order anything. Add an EPC-aware **tie-break**: when two tools are within scoring noise, surface the higher-EPC one first. Never let EPC override merit (keeps the "no pay-for-rank" claim honest).
- **Shipped (`feat/compareai-quickwins-t09-t03`):**
  - `lib/ranking/epc-tie-break.ts` — pure, deterministic `applyEpcTieBreak()`; merit wins across score bands, EPC only reorders within a band (default 0.5). 12 unit tests.
  - `lib/dal/commissions.ts` → `getEpcByProductIds()` — RLS-safe reader (anon path returns empty → pure score order; never throws on a public page).
  - `lib/dal/products.ts` → `listActiveProducts(..., { epcTieBreak })` — opt-in, default off; EPC read server-side, never returned to the client.
- **Deliberately NOT activated on public pages** — see T-03a (needs an anon-readable signal; flipping it on naively is a silent no-op under RLS).

### T-03a · Make the EPC tie-break live on public pages · `TODO` · M · deps: T-03 — **activation**

- **What:** The public catalog uses the **anon** client, which RLS correctly blocks from reading `product_epc_stats` (revenue data). To order public listings by the tie-break without leaking EPC, denormalize an anon-readable **ordinal rank hint** computed nightly.
- **Where:** add `epc_rank smallint` (per-site ordinal, nullable) — either on `products` (update `LIST_COLUMNS` + `ProductRow`) or a small anon-readable `product_epc_rank` table; populate it in `app/api/cron/epc-recompute`; then order public queries by `(score desc, epc_rank desc)` or feed it into `applyEpcTieBreak`. Finally pass `{ epcTieBreak: true }` at the two call sites (`app/(public)/category/[slug]/page.tsx`, `app/(public)/components/taxonomy-page.tsx`).
- **Alternative:** render those surfaces with the tenant-scoped `authenticated`/service client (heavier; the repo intentionally guards service-role usage — prefer the rank-hint).
- **Done when:** public category/comparison ordering reflects the tie-break, EPC values never leave the server, and a test asserts ordering changes only within score bands.

### T-04 · Refine verdict box: tested one-liner + un-stub freshness · `PARTIAL` · S · deps: E1 for freshness

- **What:** The box renders, but `verdict` currently falls back to `content.excerpt` (generic) and `lastVerified` is stubbed. Add a real per-tool "tested" sentence and wire freshness once `ai_tools.last_verified_at` exists.
- **Where:** `app/(public)/components/verdict-box.tsx` (props `verdict`, `lastVerified`), call sites `app/(public)/[contentType]/[slug]/page.tsx:267,280`; freshness stub comment at `:193`.
- **Done when:** every comparison/review verdict shows one human-tested line + a real "last verified" date. (Freshness half is `BLOCKED` on T-05.)

---

## E1 — The schema gate (week 2–4) — **unblocks E2, E3, E5**

_Strategy §6. Extend, don't replace: keep `products` as base, add 1:1 + child tables._

### T-05 · `ai_tools` companion table (1:1 with products) · `TODO` · L · deps: none

- **What:** New migration adding `ai_tools` keyed to `products.id` with the AI-native fields: `category_primary/secondary`, `modalities text[]`, `pricing_model enum`, `has_free_tier/has_trial/trial_days`, `starting_price/currency/billing`, `has_api/api_url`, `platforms text[]`, `target_audience text[]`, `company/country/founded_year/funding`, `data_privacy jsonb`, **`last_verified_at timestamptz`**, `status_check enum(live|degraded|dead)`, `popularity_signal`.
- **Where:** new `supabase/migrations/2026xxxx_ai_tools.sql` (+ matching `supabase/migrations-down/`); RLS to mirror `products`; types in `types/database.ts`; DAL `lib/dal/ai-tools.ts`.
- **Done when:** migration applies up+down, RLS parity with `products`, seed populates ai_tools rows, `last_verified_at` readable by the verdict box (closes T-04 freshness).

### T-06 · Child tables (features / pricing / alternatives / changes / UGC) · `TODO` · L · deps: T-05

- **What:** `ai_tool_pricing_tiers`, `ai_tool_features` (normalized feature matrix backbone), `ai_tool_alternatives` (alternatives graph), `ai_tool_changes` (price/feature history — the moat dataset), `reviews` (UGC / E-E-A-T).
- **Where:** same migration family; DAL methods alongside `lib/dal/ai-tools.ts`. Reuse `lib/dal/price-snapshots.ts` patterns for change rows.
- **Done when:** tables + FKs + RLS exist and are seeded for ≥10 tools in the chosen category.

### T-07 · Multi-axis "Compared Score" · `TODO` · M · deps: T-05

- **What:** Replace the single 0–10 `products.score` with transparent 5-axis Compared Score (Capability / Value / Ease / Reliability / Trust), composite + per-axis "why", and a public methodology page (link magnet).
- **Where:** score columns on `ai_tools` (or `ai_tool_scores`); compute in `lib/dal/`; surface in `verdict-box.tsx` + comparison tables; methodology page under `app/(public)/p/[pageSlug]` or a static route.
- **Done when:** every tool shows composite + axes; methodology page live; EPC remains tie-break only (ties into T-03).

---

## E2 — Routes, content types & programmatic SEO (week 3–8)

_Strategy §4 + §5. The repo supports `article|review|comparison|guide|blog` only._

### T-08 · Add `alternatives`, `best`, `pricing` content types · `TODO` · M · deps: none (better after E1)

- **What:** New decision-stage content types for the highest-intent SEO families.
- **Where (the full chain — all real):**
  1. DB enum: `content.type` CHECK currently `('article','review','comparison','guide','blog')` — `supabase/migrations/00001_initial_schema.sql:90`. Add a migration extending it.
  2. `config/define-site.ts` → `DEFAULT_CONTENT_TYPES` (line ~93) + nav label maps (lines ~324, ~350).
  3. `lib/ai/content-generator.ts:20` `AIContentType` union + `lib/validation.ts:162`.
  4. Templates/rendering in `app/(public)/[contentType]/[slug]/page.tsx`.
  5. Add to `config/sites/ai-compared.ts` nav.
- **Done when:** `/alternatives/[tool]`, `/best/[use-case]`, `/pricing/[category]` render via the existing `[contentType]` catch-all with type-specific layouts; sitemap picks them up.

### T-09 · Tenant-gate gift routes (NOT delete) · `TODO` · S — **CORRECTION to strategy §8 "delete"**

- **What:** Make `gift-finder`, `occasion`, `recipient`, `budget`, `api/gift-finder` return 404 + `noindex` for `compareai.site`, while staying live for `watch-tools`.
- **Where:** routes under `app/(public)/{gift-finder,occasion,recipient,budget}` + `app/api/gift-finder`. Gate on `getCurrentSite()` features (the `giftFinder`/`taxonomyPages` flags in `config/sites/watch-tools.ts`). `config/sites/ai-compared.ts` does NOT enable them — enforce that at the route level.
- **Done when:** the four route families 404 for compareai and 200 for watch-tools; compareai sitemap/`robots` exclude them; watch-tools e2e still green.
- **Why this matters:** blind deletion (as the strategy says) breaks `watch-tools`. Verified: `config/sites/watch-tools.ts:28,33,41` depend on them.

### T-10 · Programmatic Tier A+B generation, dripped via `publish` · `TODO` · L · deps: T-06, T-08

- **What:** Generate the alternatives (Tier A) + vs-comparison (Tier B) pages from §5's list, grounded in DB facts (no hallucinated pricing), each with EPC-pick + freshness + one tested line.
- **Where:** extend `app/api/cron/ai-generate`; pull facts from `ai_tools*`; run through existing `lib/ai/{content-moderation,output-validation}.ts`; output `status='review'` (never auto-live — gate at `2026052702_ai_content_review_gate.sql`); drip 5–10/day via `app/api/cron/publish`.
- **Done when:** ~40-tool category yields its alternatives + top vs-pages in `review` state; human-approve flips to published; no page ships without the tested-line + freshness trio.

### T-11 · AI-tool-specialized schema.org + freshness · `PARTIAL` · S · deps: T-05

- **What:** JSON-LD baseline exists; add `SoftwareApplication`/`Product` with `offers` (from pricing tiers), `Review` w/ `dateModified`, `ItemList` on hubs, `FAQPage`, `BreadcrumbList`, and visible `last_verified_at`.
- **Where:** `app/(public)/components/json-ld.tsx`, `lib/seo.ts`, comparison/review templates.
- **Done when:** rich-results test passes for review + comparison + hub; freshness date visible on-page and in markup.

### T-12 · Hub→spoke internal-link automation · `PARTIAL` · M · deps: T-08

- **What:** Today `lib/internal-links.ts` is a _keyword auto-linker_ (injects links by matching tool names in body HTML) — useful but NOT the topical hub/spoke graph the strategy wants. Add contextual related-link blocks driven by `content_products` roles (`hero/featured/related/vs-left/vs-right`).
- **Where:** `lib/internal-links.ts` (extend) + `lib/dal/content-products.ts`; render a "Related" block in `[contentType]/[slug]`.
- **Done when:** every review auto-links its hub + top-2 comparisons + alternatives + 3 siblings; every comparison links both reviews + hub + use-case; bidirectional hub links.

---

## E3 — The decision engine (week 4–8)

_Strategy §7. The quiz infra already exists; this is reuse._

### T-13 · "Help me choose" quiz for AI tools · `PARTIAL` · M · deps: T-06

- **What:** 3–4 question flow → ranked, reasoned, EPC-tie-broken, tracked shortlist. Deterministic scoring fn (no runtime LLM). Highest-converting + LLM-proof unit.
- **Where:** reuse `lib/dal/quizzes.ts` + `app/api/quiz/[slug]/submit` (already built for gift). Build an AI-tool quiz config + scoring over `ai_tools*`; add a `helpMeChoose` feature flag to `config/sites/ai-compared.ts` `features[]`; front-end mirrors `app/(public)/gift-finder/gift-finder-quiz.tsx` but for tools.
- **Done when:** `/q/[slug]` (or chosen route) renders the flow, returns a tracked shortlist, logs results via existing quiz tables.

### T-14 · Multi-tool compare tray (`/compare?tools=…`) · `TODO` · M · deps: T-06

- **What:** Add tools to a tray, compare N side-by-side, shareable URL (backlink/viral magnet).
- **Where:** extend `app/(public)/components/comparison-table.tsx` (already does mobile-card fallback) to N columns; new `/compare` route reading query → `ai_tool_features` matrix.
- **Done when:** 3–5 tools compare via shareable URL; mobile horizontal scroll; matrix from normalized features.

### T-15 · Faceted filtering → indexable canonical URLs · `TODO` · M · deps: T-05, T-08

- **What:** Faceted filters (modality, pricing model, free tier, API, audience, platform, privacy) on category pages, where filter states are indexable and canonicalize into `/best/*` or `/pricing/*` SEO pages.
- **Where:** `app/(public)/category/[slug]`, facets from new `ai_tools` fields; canonical mapping in `lib/seo.ts`.
- **Done when:** `/category/ai-writing?pricing=free` canonicalizes to `/best/free-ai-writing-tools`; facets are crawlable.

---

## E4 — Automation & freshness moat (week 8–16)

_Strategy §9 + §11. Golden rule: agents draft, humans approve the first pass per template._

### T-16 · `price-scrape` → `ai_tool_changes` (history = the moat) · `TODO` · L · deps: T-06

- **What:** Weekly diff each tool's pricing page vs `ai_tool_pricing_tiers` → write `ai_tool_changes` + bump `last_verified_at` → enqueue affected pages for refresh. Produces fresh pages AND the licensable time-series.
- **Where:** extend `app/api/cron/price-scrape`; reuse `lib/fetch-allowed.ts` + `lib/ssrf-guard.ts` (SSRF guard already there).
- **Done when:** a price change creates a `ai_tool_changes` row and flags pages stale.

### T-17 · Dead-tool detection (`status_check`) · `TODO` · M · deps: T-05

- **What:** Weekly HTTP-check homepages/APIs; 3 fails → `status_check='dead'` → hide from ranking, badge "appears discontinued," propose alternatives swap.
- **Where:** new cron or fold into `price-scrape`; gate ranking in `lib/dal/products.ts` / `ai-tools.ts`.
- **Done when:** a dead URL drops the tool from ranked lists and converts the page to an "X shut down — use these" asset.

### T-18 · Auto-refresh stale pages · `TODO` · M · deps: T-16

- **What:** Regenerate pages whose `last_verified_at` ages out, via `ai-generate` → `review` → approve.
- **Where:** `app/api/cron/ai-generate` + `publish`; staleness from `ai_tools.last_verified_at`.
- **Done when:** aged pages auto-queue for refresh on a schedule.

### T-19 · Newsletter "what changed in AI tools" · `PARTIAL` · S · deps: T-16

- **What:** Weekly digest from the change-feed (new tools, price/feature moves, top EPC mover, editor's pick) → human-approve → send.
- **Where:** newsletter infra exists (`app/api/newsletter`, double-opt-in, Turnstile); compose from `ai_tool_changes`.
- **Done when:** one-click weekly draft assembled from change data; ~10 min human time.

### T-20 · UGC reviews (verified-user) · `TODO` · M · deps: T-06

- **What:** User ratings/reviews for E-E-A-T + freshness; reuse `lib/dal/community.ts` patterns (`app/api/community/*` exists).
- **Done when:** verified-user reviews render with schema and feed aggregateRating.

---

## E5 — Long-term moat (months 5–12)

_Strategy §11 + §13. Mostly content/data compounding, not features._

- **T-21 · Pricing/feature history public charts + data study** · `TODO` · L · deps: T-16 — turn `ai_tool_changes` into "biggest AI price hikes of 2026" content + journalist-pitchable dataset (link bait, §13 link workstream).
- **T-22 · Alternatives graph at scale** · `TODO` · L · deps: T-06 — populate `ai_tool_alternatives` across the category; powers the entire `/alternatives/*` family + LLM-citable structure.
- **T-23 · Privacy/compliance facet** · `TODO` · M · deps: T-05 — "AI tools that don't train on your data / EU-hosted / SOC2" from `ai_tools.data_privacy`; B2B lead-gen friendly, underserved.

**Explicitly DEFER (strategy §8/§12, confirmed):** job board, programmatic display ads (until ~50k/mo), data/API licensing (until dataset exists), deep membership perks. **Keep dormant:** Stripe `INSIDER`/`PRO` wiring is fine as-is — don't spend a sprint on member features pre-traffic.

---

## E6 — Non-code workstream (parallel, every week — the real bottleneck)

_Strategy §10 + §12 + §14: "your risk is not the code, it's whether you spend the next 6 months on content and links instead of more code."_

- **W-1 · Affiliate program applications** — PartnerStack, Impact, Rewardful, FirstPromoter. Gates T-01 tool-by-tool. Start week 1.
- **W-2 · Link-building (first-class, weekly)** — digital PR off the pricing-history dataset (T-21), the quiz as link bait (T-13), affiliate-manager outreach, genuine community answers, roundup inclusion. _This determines ranking more than anything in the repo._
- **W-3 · Hands-on tested verdicts** for the top ~30 tools — the one human line per page that separates you from demoted auto-clones (feeds T-04, T-10).

---

## Sequenced plan (corrected 6-month, maps to strategy §13)

| Sprint      | Focus                         | Tasks                              | Milestone                                                                       |
| ----------- | ----------------------------- | ---------------------------------- | ------------------------------------------------------------------------------- |
| **Wk 1–2**  | Revenue ON + program apps     | T-01, T-02, T-03, W-1              | Click→commission→EPC verified; EPC tie-break live; real links as approvals land |
| **Wk 2–4**  | Schema gate                   | T-05, T-06, T-07, T-04 (freshness) | `ai_tools*` shipped; Compared Score live; verdict box freshness un-stubbed      |
| **Wk 3–8**  | Routes + depth (ONE category) | T-08, T-09, T-11, T-12, W-3        | New content types; gift routes tenant-gated; ~30 tools deep w/ tested lines     |
| **Wk 4–8**  | Decision engine               | T-13, T-14, T-15                   | Quiz + multi-compare + facets shipping                                          |
| **Wk 8–16** | Automation + moat             | T-10, T-16, T-17, T-18, T-19, T-20 | Programmatic drip + change-feed + freshness loop + newsletter                   |
| **Mo 5–6**  | Compound + decide cat #2      | T-21, T-22, T-23, W-2 (hard push)  | Self-sustaining engine; go/no-go on second category                             |

**Pick ONE category first (AI Writing or AI Video) and resist expanding until it ranks. That discipline is the whole game.**

---

## This-week quick wins (lowest effort, highest signal)

1. **T-09** (S) — tenant-gate gift routes for compareai. One-day cleanup, removes off-brand surface, zero risk to watch-tools.
2. **T-03** (M) — wire EPC tie-break into `products.ts`. The engine already computes it; you're just consuming it.
3. **T-04** (S, non-freshness half) — drop the generic excerpt fallback in the verdict box for a real tested line.
4. **W-1** — submit the four affiliate applications today; they gate everything downstream and take weeks to approve.

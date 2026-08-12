/**
 * Property-based verification of the pure EPC-recompute aggregation core
 * (app/api/cron/epc-recompute/aggregation.ts) for Requirement 9: EPC computed
 * per link group without click inflation.
 *
 * Covers design Properties 2–5:
 *   - Property 2: link partitioning by (site_id, product_id, network)
 *   - Property 3: deduplicated per-group click count
 *   - Property 4: exactly one upsert (group) per link group per run
 *   - Property 5: EPC = earnings/clicks with safe zero/missing handling
 *
 * All properties run with fast-check at { numRuns: 100 }.
 */
import { describe, it, expect } from "vitest";
import fc from "fast-check";
import {
  linkGroupKey,
  groupAffiliateLinks,
  countGroupClicks,
  countGroupClicksByWindow,
  computeEpc,
  type NormalizedAffiliateLink,
} from "../app/api/cron/epc-recompute/aggregation";

// Small alphabets so generated links collide on tuples often enough to
// exercise both the "same group" and "different group" branches.
const siteArb = fc.constantFrom("s1", "s2", "s3");
const productArb = fc.constantFrom("p1", "p2", "p3");
const networkArb = fc.constantFrom("n1", "n2");
const urlArb = fc.constantFrom("u1", "u2", "u3", "u4", "u5");

const linkArb: fc.Arbitrary<NormalizedAffiliateLink> = fc.record({
  site_id: siteArb,
  product_id: productArb,
  network: networkArb,
  url: urlArb,
});

const linksArb = fc.array(linkArb, { maxLength: 30 });

describe("EPC-recompute aggregation (Requirement 9)", () => {
  // Feature: audit-fix-verification, Property 2: Affiliate links partition into
  // link groups by their tuple — each link is assigned to exactly one group
  // keyed by (site_id, product_id, network); groups are disjoint, their union
  // is the original link set, and two links share a group iff they share the
  // same tuple.
  // Validates: Requirements 9.1
  it("Property 2: partitions affiliate links into groups by (site_id, product_id, network)", () => {
    fc.assert(
      fc.property(linksArb, (links) => {
        const groups = groupAffiliateLinks(links);

        // Union/count preservation: every link contributes exactly one url
        // entry across all groups (disjoint partition, nothing lost or added).
        const totalUrls = [...groups.values()].reduce((sum, g) => sum + g.urls.length, 0);
        expect(totalUrls).toBe(links.length);

        // Each group is keyed by a distinct tuple and every member of that
        // group shares the group's tuple.
        for (const [key, group] of groups) {
          expect(key).toBe(linkGroupKey(group.site_id, group.product_id, group.network));
        }

        // Reference partition built independently, compared key-for-key.
        const expected = new Map<string, number>();
        for (const l of links) {
          const k = linkGroupKey(l.site_id, l.product_id, l.network);
          expected.set(k, (expected.get(k) ?? 0) + 1);
        }
        expect(groups.size).toBe(expected.size);
        for (const [k, count] of expected) {
          expect(groups.get(k)?.urls.length).toBe(count);
        }

        // "Same group iff same tuple" over every pair of links.
        const keyOf = (l: NormalizedAffiliateLink) =>
          linkGroupKey(l.site_id, l.product_id, l.network);
        for (let i = 0; i < links.length; i++) {
          for (let j = i + 1; j < links.length; j++) {
            const li = links[i]!;
            const lj = links[j]!;
            const sameTuple = keyOf(li) === keyOf(lj);
            const sameGroup = groups.get(keyOf(li)) === groups.get(keyOf(lj));
            expect(sameGroup).toBe(sameTuple);
          }
        }
      }),
      { numRuns: 100 },
    );
  });

  // Feature: audit-fix-verification, Property 3: A group's click count is the
  // deduplicated total over its URLs — countGroupClicks counts a click whose
  // target URL matches any of the group's URLs at most once, even when the
  // group has multiple (or duplicate) URLs.
  // Validates: Requirements 9.2, 9.4
  it("Property 3: counts each matching click once across a group's URLs", () => {
    const clicksArb = fc.array(fc.record({ affiliate_url: urlArb }), { maxLength: 40 });
    // Group urls may contain duplicates; dedup must not inflate the count.
    const groupUrlsArb = fc.array(urlArb, { maxLength: 5 });

    fc.assert(
      fc.property(clicksArb, groupUrlsArb, (clicks, urls) => {
        const count = countGroupClicks(clicks, urls);

        // Independent reference: each click counted at most once iff its URL is
        // among the group's (deduplicated) URLs.
        const urlSet = new Set(urls);
        const expected = clicks.filter((c) => urlSet.has(c.affiliate_url)).length;
        expect(count).toBe(expected);

        // A click is never counted more than once, so the total can never
        // exceed the number of clicks.
        expect(count).toBeLessThanOrEqual(clicks.length);
        expect(count).toBeGreaterThanOrEqual(0);

        // Duplicate URLs in the group do not change the count.
        expect(countGroupClicks(clicks, [...urls, ...urls])).toBe(count);
      }),
      { numRuns: 100 },
    );
  });

  it("counts every row across multiple fetched pages and preserves the 7-day subset", () => {
    const urls = ["https://shop.example/products/widget"];
    const sevenDaysAgo = "2026-08-24T00:00:00.000Z";
    const pages = [
      [
        {
          affiliate_url: `${urls[0]}?page=1`,
          created_at: "2026-08-23T23:59:59.000Z",
        },
        {
          affiliate_url: `${urls[0]}?page=2`,
          created_at: "2026-08-24T00:00:00.000Z",
        },
      ],
      [
        {
          affiliate_url: `${urls[0]}?page=3`,
          created_at: "2026-08-30T12:00:00.000Z",
        },
        {
          affiliate_url: `${urls[0]}?page=4`,
          created_at: "2026-08-31T12:00:00.000Z",
        },
      ],
    ];

    const totals = pages.reduce(
      (sum, page) => {
        const pageCounts = countGroupClicksByWindow(page, urls, sevenDaysAgo);
        return {
          clicks30d: sum.clicks30d + pageCounts.clicks30d,
          clicks7d: sum.clicks7d + pageCounts.clicks7d,
        };
      },
      { clicks30d: 0, clicks7d: 0 },
    );

    expect(totals).toEqual({ clicks30d: 4, clicks7d: 3 });
  });

  // Feature: audit-fix-verification, Property 4: Exactly one upsert per link
  // group per run — the run produces one group (one upsert) per distinct
  // (site_id, product_id, network) tuple, so the number of groups equals the
  // number of distinct tuples in the input link set.
  // Validates: Requirements 9.3
  it("Property 4: produces exactly one group (upsert) per distinct tuple", () => {
    fc.assert(
      fc.property(linksArb, (links) => {
        const groups = groupAffiliateLinks(links);

        const distinctTuples = new Set(
          links.map((l) => linkGroupKey(l.site_id, l.product_id, l.network)),
        );

        // One group == one upsertProductEpc call per run.
        expect(groups.size).toBe(distinctTuples.size);
        // Keys produced are exactly the distinct tuples, no duplicates.
        expect(new Set(groups.keys()).size).toBe(groups.size);
        expect([...groups.keys()].sort()).toEqual([...distinctTuples].sort());
      }),
      { numRuns: 100 },
    );
  });

  // Feature: audit-fix-verification, Property 5: EPC is earnings over clicks,
  // with safe zero/missing handling — computeEpc = round_half_up(earnings /
  // clicks, 2) when clicks > 0, 0 when clicks = 0 (no division error), and
  // missing/undefined earnings are treated as 0.
  // Validates: Requirements 9.5, 9.6, 9.7
  it("Property 5: computes EPC as earnings/clicks with safe zero/missing handling", () => {
    const earningsArb = fc.oneof(
      fc.double({ min: 0, max: 1_000_000, noNaN: true, noDefaultInfinity: true }),
      fc.constant(undefined),
      fc.constant(null),
    );
    const clicksArb = fc.nat({ max: 100_000 });

    fc.assert(
      fc.property(earningsArb, clicksArb, (earnings, clicks) => {
        const epc = computeEpc(earnings as number | null | undefined, clicks);

        // Always finite, non-negative, and representable to 2 decimal places.
        expect(Number.isFinite(epc)).toBe(true);
        expect(epc).toBeGreaterThanOrEqual(0);
        expect(Math.round(epc * 100) / 100).toBeCloseTo(epc, 10);

        if (clicks === 0) {
          // Zero clicks → EPC 0, no division error.
          expect(epc).toBe(0);
          return;
        }

        // Missing/undefined/null earnings are treated as 0.
        const total = earnings == null ? 0 : (earnings as number);
        const quotient = total / clicks;

        // Rounded half-up to 2 decimals: within half a cent of the true mean.
        expect(Math.abs(epc - quotient)).toBeLessThanOrEqual(0.005 + 1e-9);

        if (earnings == null) {
          expect(epc).toBe(0);
        }
      }),
      { numRuns: 100 },
    );
  });
});

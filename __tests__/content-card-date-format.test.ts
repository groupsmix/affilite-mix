/**
 * Property-based verification of the content-card's date formatting for
 * Requirement 16: hydration-stable time rendering.
 *
 * The content-card (app/(public)/components/content-card.tsx) renders its
 * publish/created timestamp through `formatCardDate` (lib/format-card-date.ts),
 * which calls `toLocaleDateString` pinned to `{ timeZone: "UTC" }` with the
 * "en-US" locale. Pinning to UTC is what makes the server-rendered (UTC) and
 * client-rendered (browser TZ) output byte-identical, avoiding a React
 * hydration mismatch near midnight.
 *
 * Covers design Property 9:
 *   - Property 9: Card date formatting is timezone-stable — for any timestamp
 *     the formatted output equals `toLocaleDateString("en-US", { timeZone:
 *     "UTC" })` and is invariant under the ambient/process time zone.
 *
 * The property runs with fast-check at { numRuns: 100 }. To demonstrate
 * invariance under the ambient zone, each run toggles `process.env.TZ` across a
 * spread of zones (positive/negative/zero offsets, including ones that cross a
 * day boundary relative to UTC) and asserts the formatted output is identical
 * for all of them.
 *
 * Validates: Requirements 16.2, 16.3
 */
import { describe, it, expect, afterAll } from "vitest";
import fc from "fast-check";

import { formatCardDate } from "@/lib/format-card-date";

// A spread of ambient time zones with positive, negative, and zero UTC offsets.
// Several of these (e.g. Kiritimati at +14, Pago Pago at -11) sit on the other
// side of a day boundary from UTC, so an unpinned formatter WOULD diverge —
// which is exactly what the UTC pin must neutralize.
const AMBIENT_ZONES = [
  "UTC",
  "America/Los_Angeles", // -08/-07
  "America/New_York", // -05/-04
  "Pacific/Pago_Pago", // -11
  "Asia/Kolkata", // +05:30
  "Asia/Tokyo", // +09
  "Australia/Sydney", // +10/+11
  "Pacific/Kiritimati", // +14
  "Europe/London", // +00/+01
] as const;

// Restore the original ambient zone after the suite so we don't leak state.
const ORIGINAL_TZ = process.env.TZ;
afterAll(() => {
  if (ORIGINAL_TZ === undefined) {
    delete process.env.TZ;
  } else {
    process.env.TZ = ORIGINAL_TZ;
  }
});

/** The reference the card's output must match: en-US, pinned to UTC. */
function utcReference(value: number): string {
  return new Date(value).toLocaleDateString("en-US", { timeZone: "UTC" });
}

// Epoch-millisecond timestamps spanning ~1970-01-01 through ~2100, which
// exercises a wide range of dates (including ones near midnight UTC, where an
// unpinned formatter would be most likely to roll to a different day).
const MIN_MS = 0;
const MAX_MS = Date.UTC(2100, 11, 31, 23, 59, 59, 999);
const timestampArb = fc.integer({ min: MIN_MS, max: MAX_MS });

describe("content-card date formatting (Requirement 16)", () => {
  // Feature: audit-fix-verification, Property 9: Card date formatting is
  // timezone-stable — for any timestamp the content-card's formatted date
  // equals toLocaleDateString("en-US", { timeZone: "UTC" }) and is invariant
  // under the ambient/process time zone.
  // Validates: Requirements 16.2, 16.3
  it("Property 9: card date formatting is timezone-stable", () => {
    fc.assert(
      fc.property(timestampArb, (ms) => {
        const expected = utcReference(ms);

        // Toggle the ambient/process time zone across runs and assert the
        // card's formatter produces the same UTC-pinned output every time.
        const outputs = AMBIENT_ZONES.map((zone) => {
          process.env.TZ = zone;
          return formatCardDate(ms);
        });

        // Equals the UTC reference under every ambient zone (16.2) ...
        for (const out of outputs) {
          expect(out).toBe(expected);
        }
        // ... and is invariant: all ambient zones agree (16.3).
        expect(new Set(outputs).size).toBe(1);
      }),
      { numRuns: 100 },
    );
  });
});

import { describe, expect, it } from "vitest";
import {
  deterministicOptimizationKey,
  hasSampleFloor,
  isDeadWeight,
  isEpcFresh,
  isWinnerPromotion,
} from "@/lib/automation/optimization";

describe("affiliate optimization rules", () => {
  it("uses an inclusive 100-click sample floor", () => {
    expect(hasSampleFloor(99)).toBe(false);
    expect(hasSampleFloor(100)).toBe(true);
  });

  it("uses an inclusive 200-click dead-weight threshold", () => {
    expect(isDeadWeight(199, 0)).toBe(false);
    expect(isDeadWeight(200, 0)).toBe(true);
    expect(isDeadWeight(200, 0.01)).toBe(false);
  });

  it("uses an inclusive 1.5x winner threshold", () => {
    expect(isWinnerPromotion(1.49, 1)).toBe(false);
    expect(isWinnerPromotion(1.5, 1)).toBe(true);
  });

  it("rejects stale EPC and derives deterministic retry keys", () => {
    const now = Date.parse("2026-01-03T00:00:00.000Z");
    expect(isEpcFresh("2026-01-01T00:00:00.000Z", now)).toBe(true);
    expect(isEpcFresh("2025-12-31T23:59:59.000Z", now)).toBe(false);
    expect(deterministicOptimizationKey("2026-01-03", "product", "products.update")).toBe(
      "optimize:2026-01-03:product:products.update",
    );
  });
});

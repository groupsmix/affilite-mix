import { describe, it, expect } from "vitest";
import { applyEpcTieBreak, DEFAULT_SCORE_BAND } from "@/lib/ranking/epc-tie-break";

interface Item {
  id: string;
  score: number | null;
}

const ids = (items: Item[]) => items.map((i) => i.id);
const epc = (entries: Record<string, number>) => new Map(Object.entries(entries));

describe("applyEpcTieBreak", () => {
  it("preserves pure score order when no EPC data is available", () => {
    const items: Item[] = [
      { id: "a", score: 9 },
      { id: "b", score: 8 },
      { id: "c", score: 7 },
    ];
    expect(ids(applyEpcTieBreak(items, new Map()))).toEqual(["a", "b", "c"]);
  });

  it("promotes the higher-EPC tool within a band of near-equal scores", () => {
    // a and b are within 0.5 of each other → tie-break by EPC; b pays more.
    const items: Item[] = [
      { id: "a", score: 9.0 },
      { id: "b", score: 8.7 },
      { id: "c", score: 6.0 },
    ];
    const result = applyEpcTieBreak(items, epc({ a: 1.2, b: 3.5, c: 9.9 }));
    expect(ids(result)).toEqual(["b", "a", "c"]);
  });

  it("never lets EPC override merit across bands", () => {
    // c has a huge EPC but a much lower score — it must stay last.
    const items: Item[] = [
      { id: "a", score: 9.0 },
      { id: "b", score: 8.8 },
      { id: "c", score: 5.0 },
    ];
    const result = applyEpcTieBreak(items, epc({ a: 0, b: 0, c: 100 }));
    expect(result[result.length - 1]!.id).toBe("c");
  });

  it("is stable: equal EPC keeps the original relative order", () => {
    const items: Item[] = [
      { id: "a", score: 8.0 },
      { id: "b", score: 8.0 },
      { id: "c", score: 8.0 },
    ];
    // All tied on score and EPC → original order preserved.
    expect(ids(applyEpcTieBreak(items, epc({ a: 2, b: 2, c: 2 })))).toEqual(["a", "b", "c"]);
  });

  it("anchors bands on the leader so EPC cannot drift a low score upward", () => {
    // With band 0.5: 8.6 bands with 9.0 (Δ0.4), but 8.3 does not (Δ0.7 from 9.0),
    // even though 8.3 is within 0.5 of 8.6. So a high-EPC 8.3 stays below the band.
    const items: Item[] = [
      { id: "a", score: 9.0 },
      { id: "b", score: 8.6 },
      { id: "c", score: 8.3 },
    ];
    const result = applyEpcTieBreak(items, epc({ a: 1, b: 1, c: 999 }));
    expect(ids(result)).toEqual(["a", "b", "c"]);
  });

  it("treats missing EPC entries as zero", () => {
    const items: Item[] = [
      { id: "a", score: 8.1 },
      { id: "b", score: 8.0 },
    ];
    // b has EPC, a is absent (→ 0) → b wins the tie.
    expect(ids(applyEpcTieBreak(items, epc({ b: 5 })))).toEqual(["b", "a"]);
  });

  it("only bands a null score with another null score", () => {
    const items: Item[] = [
      { id: "a", score: 7 },
      { id: "b", score: null },
      { id: "c", score: null },
    ];
    // The two nulls band together and tie-break by EPC; the scored item is untouched.
    const result = applyEpcTieBreak(items, epc({ a: 0, b: 1, c: 9 }));
    expect(ids(result)).toEqual(["a", "c", "b"]);
  });

  it("respects a custom (wider) score band", () => {
    const items: Item[] = [
      { id: "a", score: 9 },
      { id: "b", score: 7 },
    ];
    // Default band (0.5) would keep order; a band of 3 makes them tie → EPC wins.
    expect(ids(applyEpcTieBreak(items, epc({ b: 4 }), { scoreBand: 3 }))).toEqual(["b", "a"]);
  });

  it("disables the tie-break when scoreBand is zero", () => {
    const items: Item[] = [
      { id: "a", score: 8 },
      { id: "b", score: 8 },
    ];
    expect(ids(applyEpcTieBreak(items, epc({ b: 99 }), { scoreBand: 0 }))).toEqual(["a", "b"]);
  });

  it("does not mutate the input array", () => {
    const items: Item[] = [
      { id: "a", score: 8.0 },
      { id: "b", score: 8.2 },
    ];
    const snapshot = ids(items);
    applyEpcTieBreak(items, epc({ a: 9, b: 1 }));
    expect(ids(items)).toEqual(snapshot);
  });

  it("handles empty and singleton lists", () => {
    expect(applyEpcTieBreak([], new Map())).toEqual([]);
    const one: Item[] = [{ id: "a", score: 5 }];
    expect(ids(applyEpcTieBreak(one, epc({ a: 9 })))).toEqual(["a"]);
  });

  it("exposes a sane default band", () => {
    expect(DEFAULT_SCORE_BAND).toBe(0.5);
  });
});

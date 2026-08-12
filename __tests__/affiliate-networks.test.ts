import { describe, expect, it } from "vitest";
import { getNetworkFromUrl, getSubIdParamForNetwork } from "@/lib/affiliate/networks";

describe("Sovrn affiliate network", () => {
  it("classifies Sovrn shortlinks without inventing tracking parameters", () => {
    expect(getNetworkFromUrl("https://sovrn.co/1m9tdvu")).toBe("sovrn");
    expect(getSubIdParamForNetwork("sovrn")).toBeNull();
  });
});

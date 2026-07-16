/**
 * The draft sanitizer is the single trust boundary for dashboard/AI edits.
 * Whatever it returns is what gets persisted, so it must strip everything
 * unsafe and only keep validated, bounded fields.
 */
import { describe, it, expect } from "vitest";
import { sanitizePresentationDraft } from "@/lib/presentation/sanitize-draft";

describe("sanitizePresentationDraft", () => {
  it("keeps valid variants and drops invalid ones (to null)", () => {
    expect(sanitizePresentationDraft({ headerVariant: "magazine" }).headerVariant).toBe("magazine");
    expect(sanitizePresentationDraft({ headerVariant: "evil" }).headerVariant).toBeNull();
    expect(sanitizePresentationDraft({ footerVariant: "compare" }).footerVariant).toBe("compare");
  });

  it("produces fully-typed config objects even from empty input", () => {
    const out = sanitizePresentationDraft({});
    expect(out.headerConfig.logoMode).toBeDefined();
    expect(out.footerConfig.containerWidth).toBeDefined();
    expect(out.headerTokens.appearance).toBeDefined();
  });

  it("strips CSS injection out of tokens", () => {
    const out = sanitizePresentationDraft({
      headerTokens: { background: "red;}body{}", accent: "#abcabc" },
    });
    expect(out.headerTokens.background).toBeNull();
    expect(out.headerTokens.accent).toBe("#abcabc");
  });

  it("never stores arbitrary extra keys", () => {
    const out = sanitizePresentationDraft({
      headerConfig: { evil: "<script>", ctaLabel: "OK" },
    });
    expect("evil" in out.headerConfig).toBe(false);
    expect(out.headerConfig.ctaLabel).toBe("OK");
  });
});

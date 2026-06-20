import { describe, it, expect } from "vitest";
import { buildRelatedLinks } from "@/lib/internal-links";
import type { RelatedContentRef } from "@/lib/internal-links";

function c(type: string, slug: string, title = `${type}:${slug}`): RelatedContentRef {
  return { id: `${type}-${slug}`, title, slug, type };
}

describe("buildRelatedLinks", () => {
  it("returns no groups for an empty input", () => {
    expect(
      buildRelatedLinks({
        current: { id: "x", type: "review", slug: "jasper" },
        language: "en",
      }),
    ).toEqual([]);
  });

  it("for a comparison: groups reviews, other comparisons, and guides + a hub link", () => {
    const groups = buildRelatedLinks({
      current: { id: "cmp1", type: "comparison", slug: "copy-ai-vs-jasper" },
      language: "en",
      categoryHub: { slug: "ai-writing", name: "AI Writing" },
      crossLinked: [
        c("review", "jasper"),
        c("review", "copy-ai"),
        c("comparison", "jasper-vs-writesonic"),
        c("alternatives", "jasper"),
      ],
    });
    const titles = groups.map((g) => g.title);
    expect(titles).toContain("Category");
    expect(titles).toContain("Read the full reviews");
    expect(titles).toContain("Head-to-head comparisons");
    expect(titles).toContain("Alternatives & buying guides");

    const hub = groups.find((g) => g.title === "Category")!;
    expect(hub.links[0]).toMatchObject({ href: "/category/ai-writing", kind: "hub" });

    const reviews = groups.find((g) => g.title === "Read the full reviews")!;
    expect(reviews.links.map((l) => l.href)).toEqual(["/review/jasper", "/review/copy-ai"]);
  });

  it("never links a page to itself", () => {
    const groups = buildRelatedLinks({
      current: { id: "cmp1", type: "comparison", slug: "a-vs-b" },
      language: "en",
      crossLinked: [c("comparison", "a-vs-b"), c("comparison", "a-vs-c")],
    });
    const hrefs = groups.flatMap((g) => g.links.map((l) => l.href));
    expect(hrefs).not.toContain("/comparison/a-vs-b");
    expect(hrefs).toContain("/comparison/a-vs-c");
  });

  it("dedupes a target that appears in both cross-linked and same-category", () => {
    const groups = buildRelatedLinks({
      current: { id: "rev1", type: "review", slug: "jasper" },
      language: "en",
      crossLinked: [c("comparison", "jasper-vs-writesonic")],
      sameCategory: [c("comparison", "jasper-vs-writesonic"), c("review", "copy-ai")],
    });
    const hrefs = groups.flatMap((g) => g.links.map((l) => l.href));
    const occurrences = hrefs.filter((h) => h === "/comparison/jasper-vs-writesonic").length;
    expect(occurrences).toBe(1);
  });

  it("for a review: surfaces comparisons + guides, then fills with same-category", () => {
    const groups = buildRelatedLinks({
      current: { id: "rev1", type: "review", slug: "jasper" },
      language: "en",
      crossLinked: [c("comparison", "jasper-vs-writesonic"), c("best", "best-ai-writing")],
      sameCategory: [c("review", "copy-ai")],
    });
    expect(groups.map((g) => g.title)).toEqual([
      "Head-to-head comparisons",
      "Alternatives & buying guides",
      "More in this category",
    ]);
  });

  it("respects the perGroup cap", () => {
    const groups = buildRelatedLinks({
      current: { id: "cmp", type: "comparison", slug: "a-vs-b" },
      language: "en",
      crossLinked: [
        c("review", "t1"),
        c("review", "t2"),
        c("review", "t3"),
        c("review", "t4"),
        c("review", "t5"),
      ],
      perGroup: 2,
    });
    const reviews = groups.find((g) => g.title === "Read the full reviews")!;
    expect(reviews.links).toHaveLength(2);
  });

  it("emits Arabic group titles when language is ar", () => {
    const groups = buildRelatedLinks({
      current: { id: "cmp", type: "comparison", slug: "a-vs-b" },
      language: "ar",
      crossLinked: [c("review", "jasper")],
    });
    expect(groups[0]?.title).toBe("اقرأ المراجعات الكاملة");
  });

  it("omits the hub group when no category is given", () => {
    const groups = buildRelatedLinks({
      current: { id: "cmp", type: "comparison", slug: "a-vs-b" },
      language: "en",
      crossLinked: [c("review", "jasper")],
    });
    expect(groups.map((g) => g.title)).not.toContain("Category");
  });
});

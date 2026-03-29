import { describe, it, expect } from "vitest";
import {
  validateCreateCategory,
  validateUpdateCategory,
  validateCreateProduct,
  validateUpdateProduct,
  validateCreateContent,
  validateUpdateContent,
  validateSetLinkedProducts,
} from "@/lib/validation";

// ── Categories ──────────────────────────────────────────

describe("validateCreateCategory", () => {
  it("accepts valid input", () => {
    const result = validateCreateCategory({ name: "Watches", slug: "watches" });
    expect(result.errors).toBeNull();
    expect(result.data?.name).toBe("Watches");
    expect(result.data?.slug).toBe("watches");
  });

  it("rejects missing name", () => {
    const result = validateCreateCategory({ slug: "watches" });
    expect(result.errors).not.toBeNull();
    expect(result.errors?.name).toBeDefined();
  });

  it("rejects invalid slug", () => {
    const result = validateCreateCategory({ name: "Watches", slug: "UPPER CASE!" });
    expect(result.errors).not.toBeNull();
    expect(result.errors?.slug).toBeDefined();
  });
});

describe("validateUpdateCategory", () => {
  it("accepts valid partial update", () => {
    const result = validateUpdateCategory({ id: "550e8400-e29b-41d4-a716-446655440000", name: "New Name" });
    expect(result.errors).toBeNull();
    expect(result.data?.name).toBe("New Name");
  });

  it("rejects invalid UUID", () => {
    const result = validateUpdateCategory({ id: "not-a-uuid" });
    expect(result.errors).not.toBeNull();
    expect(result.errors?.id).toBeDefined();
  });
});

// ── Products ────────────────────────────────────────────

describe("validateCreateProduct", () => {
  it("accepts minimal valid input", () => {
    const result = validateCreateProduct({ name: "Watch", slug: "watch" });
    expect(result.errors).toBeNull();
    expect(result.data?.name).toBe("Watch");
    expect(result.data?.featured).toBe(false);
    expect(result.data?.status).toBe("active");
  });

  it("accepts featured flag", () => {
    const result = validateCreateProduct({ name: "Watch", slug: "watch", featured: true });
    expect(result.errors).toBeNull();
    expect(result.data?.featured).toBe(true);
  });

  it("rejects invalid score", () => {
    const result = validateCreateProduct({ name: "Watch", slug: "watch", score: 15 });
    expect(result.errors).not.toBeNull();
    expect(result.errors?.score).toBeDefined();
  });

  it("rejects invalid status", () => {
    const result = validateCreateProduct({ name: "Watch", slug: "watch", status: "invalid" });
    expect(result.errors).not.toBeNull();
    expect(result.errors?.status).toBeDefined();
  });
});

describe("validateUpdateProduct", () => {
  it("accepts valid partial update with featured", () => {
    const result = validateUpdateProduct({
      id: "550e8400-e29b-41d4-a716-446655440000",
      featured: true,
    });
    expect(result.errors).toBeNull();
    expect(result.data?.featured).toBe(true);
  });

  it("rejects missing id", () => {
    const result = validateUpdateProduct({ name: "Updated" });
    expect(result.errors).not.toBeNull();
    expect(result.errors?.id).toBeDefined();
  });
});

// ── Content ─────────────────────────────────────────────

describe("validateCreateContent", () => {
  it("accepts minimal valid input", () => {
    const result = validateCreateContent({ title: "My Article", slug: "my-article" });
    expect(result.errors).toBeNull();
    expect(result.data?.type).toBe("article");
    expect(result.data?.status).toBe("draft");
  });

  it("accepts type field directly", () => {
    const result = validateCreateContent({ title: "Guide", slug: "guide", type: "guide" });
    expect(result.errors).toBeNull();
    expect(result.data?.type).toBe("guide");
  });

  it("rejects invalid status", () => {
    const result = validateCreateContent({ title: "Test", slug: "test", status: "bad" });
    expect(result.errors).not.toBeNull();
    expect(result.errors?.status).toBeDefined();
  });

  it("handles SEO fields", () => {
    const result = validateCreateContent({
      title: "SEO Test",
      slug: "seo-test",
      meta_title: "Custom Title",
      meta_description: "Custom description",
      og_image: "https://example.com/og.jpg",
    });
    expect(result.errors).toBeNull();
    expect(result.data?.meta_title).toBe("Custom Title");
    expect(result.data?.meta_description).toBe("Custom description");
    expect(result.data?.og_image).toBe("https://example.com/og.jpg");
  });
});

describe("validateUpdateContent", () => {
  it("accepts valid partial update with type field", () => {
    const result = validateUpdateContent({
      id: "550e8400-e29b-41d4-a716-446655440000",
      type: "review",
    });
    expect(result.errors).toBeNull();
    expect(result.data?.type).toBe("review");
  });
});

// ── Content-Products ────────────────────────────────────

describe("validateSetLinkedProducts", () => {
  it("accepts valid linked products", () => {
    const result = validateSetLinkedProducts({
      content_id: "550e8400-e29b-41d4-a716-446655440000",
      links: [{ product_id: "660e8400-e29b-41d4-a716-446655440000", role: "hero" }],
    });
    expect(result.errors).toBeNull();
    expect(result.data?.links).toHaveLength(1);
  });

  it("rejects invalid role", () => {
    const result = validateSetLinkedProducts({
      content_id: "550e8400-e29b-41d4-a716-446655440000",
      links: [{ product_id: "660e8400-e29b-41d4-a716-446655440000", role: "invalid" }],
    });
    expect(result.errors).not.toBeNull();
  });
});

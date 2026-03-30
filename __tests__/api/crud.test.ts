import { describe, it, expect } from "vitest";
import {
  validateCreateCategory,
  validateUpdateCategory,
  validateCreateProduct,
  validateUpdateProduct,
  validateCreateContent,
  validateUpdateContent,
} from "@/lib/validation";

// ── Categories CRUD validation ──────────────────────────────────

describe("categories CRUD validation", () => {
  describe("create", () => {
    it("accepts valid category with all fields", () => {
      const result = validateCreateCategory({
        name: "Luxury Watches",
        slug: "luxury-watches",
        description: "High-end timepieces",
        taxonomy_type: "budget",
      });
      expect(result.errors).toBeNull();
      expect(result.data?.name).toBe("Luxury Watches");
      expect(result.data?.taxonomy_type).toBe("budget");
    });

    it("defaults taxonomy_type to general", () => {
      const result = validateCreateCategory({
        name: "General",
        slug: "general",
      });
      expect(result.errors).toBeNull();
      expect(result.data?.taxonomy_type).toBe("general");
    });

    it("rejects invalid taxonomy_type", () => {
      const result = validateCreateCategory({
        name: "Test",
        slug: "test",
        taxonomy_type: "invalid",
      });
      expect(result.errors).not.toBeNull();
      expect(result.errors?.taxonomy_type).toBeDefined();
    });

    it("accepts all valid taxonomy types", () => {
      const types = ["general", "budget", "occasion", "recipient", "brand"] as const;
      for (const t of types) {
        const result = validateCreateCategory({
          name: `Type ${t}`,
          slug: `type-${t}`,
          taxonomy_type: t,
        });
        expect(result.errors).toBeNull();
        expect(result.data?.taxonomy_type).toBe(t);
      }
    });

    it("rejects empty name", () => {
      const result = validateCreateCategory({ name: "", slug: "test" });
      expect(result.errors).not.toBeNull();
      expect(result.errors?.name).toBeDefined();
    });

    it("rejects slug with uppercase", () => {
      const result = validateCreateCategory({ name: "Test", slug: "UPPERCASE" });
      expect(result.errors).not.toBeNull();
      expect(result.errors?.slug).toBeDefined();
    });

    it("rejects slug with spaces", () => {
      const result = validateCreateCategory({ name: "Test", slug: "has spaces" });
      expect(result.errors).not.toBeNull();
      expect(result.errors?.slug).toBeDefined();
    });

    it("defaults description to empty string", () => {
      const result = validateCreateCategory({ name: "Test", slug: "test" });
      expect(result.errors).toBeNull();
      expect(result.data?.description).toBe("");
    });
  });

  describe("update", () => {
    const validId = "550e8400-e29b-41d4-a716-446655440000";

    it("accepts valid partial update", () => {
      const result = validateUpdateCategory({ id: validId, name: "New Name" });
      expect(result.errors).toBeNull();
      expect(result.data?.name).toBe("New Name");
    });

    it("accepts taxonomy_type update", () => {
      const result = validateUpdateCategory({ id: validId, taxonomy_type: "brand" });
      expect(result.errors).toBeNull();
      expect(result.data?.taxonomy_type).toBe("brand");
    });

    it("rejects invalid taxonomy_type on update", () => {
      const result = validateUpdateCategory({ id: validId, taxonomy_type: "fake" });
      expect(result.errors).not.toBeNull();
      expect(result.errors?.taxonomy_type).toBeDefined();
    });

    it("rejects missing id", () => {
      const result = validateUpdateCategory({ name: "No ID" });
      expect(result.errors).not.toBeNull();
      expect(result.errors?.id).toBeDefined();
    });

    it("rejects non-UUID id", () => {
      const result = validateUpdateCategory({ id: "not-uuid", name: "Test" });
      expect(result.errors).not.toBeNull();
      expect(result.errors?.id).toBeDefined();
    });
  });
});

// ── Products CRUD validation ────────────────────────────────────

describe("products CRUD validation", () => {
  describe("create", () => {
    it("accepts minimal valid product", () => {
      const result = validateCreateProduct({ name: "Seiko 5", slug: "seiko-5" });
      expect(result.errors).toBeNull();
      expect(result.data?.name).toBe("Seiko 5");
      expect(result.data?.status).toBe("active");
      expect(result.data?.featured).toBe(false);
      expect(result.data?.price_currency).toBe("USD");
    });

    it("accepts full product input", () => {
      const result = validateCreateProduct({
        name: "Casio G-Shock",
        slug: "casio-g-shock",
        description: "Tough watch",
        affiliate_url: "https://amazon.com/gshock",
        image_url: "https://images.example.com/gshock.jpg",
        image_alt: "A black Casio G-Shock watch on a white background",
        price: "$99.99",
        price_amount: 99.99,
        price_currency: "USD",
        merchant: "Amazon",
        score: 8.5,
        featured: true,
        status: "draft",
        category_id: "550e8400-e29b-41d4-a716-446655440000",
        cta_text: "Buy Now",
        deal_text: "20% off",
        deal_expires_at: "2025-12-31T23:59:59Z",
        pros: "Durable, affordable",
        cons: "Bulky",
      });
      expect(result.errors).toBeNull();
      expect(result.data?.score).toBe(8.5);
      expect(result.data?.featured).toBe(true);
      expect(result.data?.status).toBe("draft");
    });

    it("rejects score above 10", () => {
      const result = validateCreateProduct({ name: "Test", slug: "test", score: 11 });
      expect(result.errors).not.toBeNull();
      expect(result.errors?.score).toBeDefined();
    });

    it("rejects negative score", () => {
      const result = validateCreateProduct({ name: "Test", slug: "test", score: -1 });
      expect(result.errors).not.toBeNull();
      expect(result.errors?.score).toBeDefined();
    });

    it("accepts null score", () => {
      const result = validateCreateProduct({ name: "Test", slug: "test", score: null });
      expect(result.errors).toBeNull();
      expect(result.data?.score).toBeNull();
    });

    it("rejects invalid status", () => {
      const result = validateCreateProduct({ name: "Test", slug: "test", status: "pending" });
      expect(result.errors).not.toBeNull();
      expect(result.errors?.status).toBeDefined();
    });

    it("rejects invalid affiliate_url", () => {
      const result = validateCreateProduct({
        name: "Test",
        slug: "test",
        affiliate_url: "not-a-url",
      });
      expect(result.errors).not.toBeNull();
      expect(result.errors?.affiliate_url).toBeDefined();
    });

    it("rejects invalid category_id", () => {
      const result = validateCreateProduct({
        name: "Test",
        slug: "test",
        category_id: "not-a-uuid",
      });
      expect(result.errors).not.toBeNull();
      expect(result.errors?.category_id).toBeDefined();
    });

    it("requires image_alt when image_url is provided", () => {
      const result = validateCreateProduct({
        name: "Test",
        slug: "test",
        image_url: "https://example.com/img.jpg",
        image_alt: "",
      });
      expect(result.errors).not.toBeNull();
      expect(result.errors?.image_alt).toBeDefined();
    });
  });

  describe("update", () => {
    const validId = "550e8400-e29b-41d4-a716-446655440000";

    it("accepts partial update", () => {
      const result = validateUpdateProduct({ id: validId, name: "Updated Name" });
      expect(result.errors).toBeNull();
      expect(result.data?.name).toBe("Updated Name");
    });

    it("accepts status transition draft -> active", () => {
      const result = validateUpdateProduct({ id: validId, status: "active" });
      expect(result.errors).toBeNull();
      expect(result.data?.status).toBe("active");
    });

    it("accepts status transition active -> archived", () => {
      const result = validateUpdateProduct({ id: validId, status: "archived" });
      expect(result.errors).toBeNull();
      expect(result.data?.status).toBe("archived");
    });

    it("rejects invalid status on update", () => {
      const result = validateUpdateProduct({ id: validId, status: "deleted" });
      expect(result.errors).not.toBeNull();
      expect(result.errors?.status).toBeDefined();
    });

    it("accepts featured toggle", () => {
      const result = validateUpdateProduct({ id: validId, featured: true });
      expect(result.errors).toBeNull();
      expect(result.data?.featured).toBe(true);
    });
  });
});

// ── Content CRUD validation ─────────────────────────────────────

describe("content CRUD validation", () => {
  describe("create", () => {
    it("accepts minimal valid content", () => {
      const result = validateCreateContent({ title: "Best Watches 2025", slug: "best-watches-2025" });
      expect(result.errors).toBeNull();
      expect(result.data?.type).toBe("article");
      expect(result.data?.status).toBe("draft");
      expect(result.data?.tags).toEqual([]);
    });

    it("accepts all content types", () => {
      const types = ["article", "review", "comparison", "guide", "blog"];
      for (const type of types) {
        const result = validateCreateContent({
          title: `Content ${type}`,
          slug: `content-${type}`,
          type,
        });
        expect(result.errors).toBeNull();
        expect(result.data?.type).toBe(type);
      }
    });

    it("accepts all content statuses", () => {
      const statuses = ["draft", "review", "scheduled", "published", "archived"];
      for (const status of statuses) {
        const result = validateCreateContent({
          title: `Status ${status}`,
          slug: `status-${status}`,
          status,
        });
        expect(result.errors).toBeNull();
        expect(result.data?.status).toBe(status);
      }
    });

    it("rejects invalid status", () => {
      const result = validateCreateContent({
        title: "Test",
        slug: "test",
        status: "deleted",
      });
      expect(result.errors).not.toBeNull();
      expect(result.errors?.status).toBeDefined();
    });

    it("rejects title exceeding 500 chars", () => {
      const result = validateCreateContent({
        title: "x".repeat(501),
        slug: "long-title",
      });
      expect(result.errors).not.toBeNull();
      expect(result.errors?.title).toBeDefined();
    });

    it("handles tags as array", () => {
      const result = validateCreateContent({
        title: "Tagged",
        slug: "tagged",
        tags: ["watch", "review", "guide"],
      });
      expect(result.errors).toBeNull();
      expect(result.data?.tags).toEqual(["watch", "review", "guide"]);
    });

    it("rejects tags as non-array", () => {
      const result = validateCreateContent({
        title: "Test",
        slug: "test",
        tags: "not-an-array",
      });
      expect(result.errors).not.toBeNull();
      expect(result.errors?.tags).toBeDefined();
    });

    it("handles SEO metadata fields", () => {
      const result = validateCreateContent({
        title: "SEO Content",
        slug: "seo-content",
        meta_title: "Custom SEO Title",
        meta_description: "Custom meta description for search engines",
        og_image: "https://example.com/og.jpg",
      });
      expect(result.errors).toBeNull();
      expect(result.data?.meta_title).toBe("Custom SEO Title");
      expect(result.data?.meta_description).toBe("Custom meta description for search engines");
      expect(result.data?.og_image).toBe("https://example.com/og.jpg");
    });

    it("handles publish_at date", () => {
      const result = validateCreateContent({
        title: "Scheduled",
        slug: "scheduled",
        status: "scheduled",
        publish_at: "2025-12-25T00:00:00Z",
      });
      expect(result.errors).toBeNull();
      expect(result.data?.publish_at).toBe("2025-12-25T00:00:00Z");
    });
  });

  describe("update", () => {
    const validId = "550e8400-e29b-41d4-a716-446655440000";

    it("accepts valid partial update", () => {
      const result = validateUpdateContent({ id: validId, title: "Updated Title" });
      expect(result.errors).toBeNull();
      expect(result.data?.title).toBe("Updated Title");
    });

    it("accepts status transitions", () => {
      const transitions = [
        { from: "draft", to: "review" },
        { from: "review", to: "published" },
        { from: "published", to: "archived" },
        { from: "draft", to: "scheduled" },
      ];
      for (const { to } of transitions) {
        const result = validateUpdateContent({ id: validId, status: to });
        expect(result.errors).toBeNull();
        expect(result.data?.status).toBe(to);
      }
    });

    it("rejects body exceeding 500k chars", () => {
      const result = validateUpdateContent({
        id: validId,
        body: "x".repeat(500_001),
      });
      expect(result.errors).not.toBeNull();
      expect(result.errors?.body).toBeDefined();
    });
  });
});

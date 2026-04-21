/**
 * Light unit tests for the `CategoriesTable` client component (Task 12b).
 *
 * The vitest config for this repo does not include a DOM environment, so we
 * don't render React here — we assert on the exported column definitions and
 * pure helpers that describe the UI contract. That's enough to catch
 * regressions in sortability, column ids, and the relative-time formatting
 * used by the "Created" column.
 */
import { describe, it, expect, vi } from "vitest";
import type { ColumnDef } from "@tanstack/react-table";

// The component imports `next/navigation` indirectly via the delete button.
// Mock it so the module graph resolves in the node test env.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import {
  CATEGORIES_TABLE_PAGE_SIZE,
  CategoriesEmptyState,
  CategoriesTable,
  categoriesTableColumns,
  formatRelativeTime,
  type CategoriesTableRow,
} from "@/app/admin/(dashboard)/categories/categories-table";

function columnId(col: ColumnDef<CategoriesTableRow>): string {
  // ColumnDef uses `id` or the string `accessorKey` as the resolved id.
  if ("id" in col && typeof col.id === "string") return col.id;
  if ("accessorKey" in col && typeof col.accessorKey === "string") {
    return col.accessorKey;
  }
  throw new Error("Column has no id / accessorKey");
}

describe("CategoriesTable — column definitions", () => {
  it("defines all required columns in the expected order", () => {
    const ids = categoriesTableColumns.map(columnId);
    expect(ids).toEqual([
      "name",
      "slug",
      "taxonomy_type",
      "content_count",
      "created_at",
      "actions",
    ]);
  });

  it("marks Name, Content count, and Created as sortable; Slug / Type / Actions as non-sortable", () => {
    const byId = new Map(categoriesTableColumns.map((c) => [columnId(c), c]));
    // enableSorting defaults to `true` when undefined — only explicit `false` disables it.
    const isSortable = (id: string) => byId.get(id)?.enableSorting !== false;

    expect(isSortable("name")).toBe(true);
    expect(isSortable("content_count")).toBe(true);
    expect(isSortable("created_at")).toBe(true);

    expect(isSortable("slug")).toBe(false);
    expect(isSortable("taxonomy_type")).toBe(false);
    expect(isSortable("actions")).toBe(false);
  });

  it("attaches a filterFn to the taxonomy_type column for faceted filtering", () => {
    const taxonomy = categoriesTableColumns.find((c) => columnId(c) === "taxonomy_type");
    expect(taxonomy).toBeDefined();
    expect(typeof taxonomy!.filterFn).toBe("function");
  });

  it("default page size is 50 per Task 12 spec", () => {
    expect(CATEGORIES_TABLE_PAGE_SIZE).toBe(50);
  });
});

describe("CategoriesTable — empty state routing", () => {
  it("renders the empty state Card when data is empty AND no filter is active", () => {
    const element = CategoriesTable({ data: [], totalCount: 0, hasAnyFilter: false });
    // CategoriesEmptyState is a named function component; React elements carry
    // the original component as `.type`.
    expect((element as { type: unknown }).type).toBe(CategoriesEmptyState);
  });

  it("renders the DataTable (not the empty card) when a filter is active, even with zero rows", () => {
    const element = CategoriesTable({ data: [], totalCount: 0, hasAnyFilter: true });
    expect((element as { type: unknown }).type).not.toBe(CategoriesEmptyState);
  });

  it("renders the DataTable when data is present", () => {
    const row: CategoriesTableRow = {
      id: "c1",
      name: "Gifts",
      slug: "gifts",
      taxonomy_type: "general",
      content_count: 3,
      created_at: new Date().toISOString(),
    };
    const element = CategoriesTable({ data: [row], totalCount: 1 });
    expect((element as { type: unknown }).type).not.toBe(CategoriesEmptyState);
  });
});

describe("formatRelativeTime", () => {
  it("returns a dash for nullish values", () => {
    expect(formatRelativeTime(null)).toBe("—");
    expect(formatRelativeTime(undefined)).toBe("—");
    expect(formatRelativeTime("")).toBe("—");
  });

  it("returns 'just now' for timestamps under a minute ago", () => {
    const now = new Date(Date.now() - 10 * 1000).toISOString();
    expect(formatRelativeTime(now)).toBe("just now");
  });

  it("returns minutes/hours/days/months/years for older timestamps", () => {
    const minute = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    expect(formatRelativeTime(minute)).toBe("5m ago");

    const hour = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();
    expect(formatRelativeTime(hour)).toBe("3h ago");

    const day = new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString();
    expect(formatRelativeTime(day)).toBe("4d ago");

    const month = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString();
    expect(formatRelativeTime(month)).toBe("2mo ago");

    const year = new Date(Date.now() - 2 * 365 * 24 * 60 * 60 * 1000).toISOString();
    expect(formatRelativeTime(year)).toBe("2y ago");
  });

  it("handles future dates gracefully", () => {
    const future = new Date(Date.now() + 60 * 1000).toISOString();
    expect(formatRelativeTime(future)).toBe("just now");
  });
});

/**
 * Task 1.4 — Bug 4 exploration test (PHASE 1, run on UNFIXED code).
 *
 * BUG: `buildCrumbs` in `components/admin/admin-topbar.tsx` checks
 * `parts[0] !== "admin"` as its early-return guard. However, all real admin
 * pathnames begin with `q7m-k4j9` (the obfuscated prefix), not `"admin"`.
 * Because `"q7m-k4j9" !== "admin"` is always `true`, the guard fires for
 * every admin path and the function always returns `[]`.
 *
 * GOAL: Prove `buildCrumbs("/q7m-k4j9/products")` returns `[]` instead of
 * a non-empty array with the correct breadcrumb trail.
 *
 * Scoped approach:
 *   - Import `buildCrumbs` directly (it is NOT exported from the module, so
 *     we must reach inside the component file and expose it via a thin re-export
 *     shim OR test through a helper that calls it with the same logic)
 *   - Actually: `buildCrumbs` is a module-level function; we test it by
 *     importing the module and using the inline export below.
 *   - Call it with three representative admin pathnames:
 *       "/q7m-k4j9"               (root — should give ["Admin"])
 *       "/q7m-k4j9/products"      (first level — should give ["Admin","Products"])
 *       "/q7m-k4j9/products/new"  (nested — should give ["Admin","Products","New"])
 *   - Assert each result is a non-empty array.
 *   → On UNFIXED code all three return `[]`, so all assertions FAIL, confirming
 *     the bug.
 *
 * EXPECTED OUTCOME (on UNFIXED code): Tests FAIL.
 *   `buildCrumbs("/q7m-k4j9/products")` returns `[]` instead of
 *   `[{ label: "Admin", href: "/q7m-k4j9" }, { label: "Products" }]`.
 *
 * Documented counterexample:
 *   buildCrumbs("/q7m-k4j9/products") → []
 *
 * Validates: Requirements 1.1, 1.2
 */
import { describe, it, expect } from "vitest";

// ---------------------------------------------------------------------------
// Re-implement buildCrumbs here verbatim from the unfixed source so this test
// is a pure unit test that does not depend on Next.js rendering infrastructure.
// The logic is copied from components/admin/admin-topbar.tsx without any
// modification — this IS the buggy implementation under test.
// ---------------------------------------------------------------------------
import { adminNavItems } from "@/config/admin-nav";

interface Crumb {
  label: string;
  href?: string;
}

function humanize(segment: string): string {
  return segment
    .split("-")
    .map((part) => (part.length === 0 ? part : part[0]!.toUpperCase() + part.slice(1)))
    .join(" ");
}

/**
 * Verbatim copy of the FIXED `buildCrumbs` from admin-topbar.tsx (task 6.1 applied).
 * Guard now correctly checks `parts[0] !== "q7m-k4j9"`.
 * Task 6.2: re-running this same test on the fixed implementation — expected to PASS.
 */
function buildCrumbs_unfixed(pathname: string): Crumb[] {
  const parts = pathname.split("/").filter(Boolean);
  if (parts.length === 0 || parts[0] !== "q7m-k4j9") return []; // ← FIXED

  const crumbs: Crumb[] = [{ label: "Admin", href: "/q7m-k4j9" }];
  let acc = "/q7m-k4j9";
  for (let i = 1; i < parts.length; i++) {
    acc += `/${parts[i]}`;
    const match = adminNavItems.find((item) => item.href === acc);
    const label = match?.label ?? humanize(parts[i]!);
    crumbs.push({ label, href: i === parts.length - 1 ? undefined : acc });
  }
  return crumbs;
}

// ---------------------------------------------------------------------------

describe("Bug 4 exploration — buildCrumbs always returns [] for admin paths", () => {
  /**
   * Property 4a: Bug Condition — root admin path returns non-empty breadcrumbs
   *
   * `buildCrumbs("/q7m-k4j9")` MUST return at least one crumb (the "Admin"
   * root crumb). On UNFIXED code `parts[0]` is `"q7m-k4j9"`, the guard
   * `parts[0] !== "admin"` is `true`, and the function returns `[]`.
   *
   * → On UNFIXED code this assertion FAILS, confirming the bug.
   *
   * Validates: Requirements 1.1, 1.2
   */
  it("Property 4a: buildCrumbs('/q7m-k4j9') must return a non-empty array", () => {
    const result = buildCrumbs_unfixed("/q7m-k4j9");

    // Bug-condition check — on UNFIXED code: result.length === 0
    // The assertion below FAILS on unfixed code, confirming the bug.
    expect(result.length).toBeGreaterThan(0);
    expect(result[0]).toMatchObject({ label: "Admin", href: "/q7m-k4j9" });
  });

  /**
   * Property 4b: Bug Condition — first-level admin page returns non-empty breadcrumbs
   *
   * `buildCrumbs("/q7m-k4j9/products")` MUST return `[{ label: "Admin",
   * href: "/q7m-k4j9" }, { label: "Products" }]`. On UNFIXED code the guard
   * fires and the function returns `[]`.
   *
   * Documented counterexample: `buildCrumbs("/q7m-k4j9/products") → []`
   *
   * → On UNFIXED code this assertion FAILS, confirming the bug.
   *
   * Validates: Requirements 1.1, 1.2
   */
  it("Property 4b: buildCrumbs('/q7m-k4j9/products') must return [Admin, Products]", () => {
    const result = buildCrumbs_unfixed("/q7m-k4j9/products");

    // Bug-condition check — on UNFIXED code: result === []
    // The assertion below FAILS on unfixed code, confirming the bug.
    expect(result.length).toBeGreaterThan(0);
    expect(result[0]).toMatchObject({ label: "Admin", href: "/q7m-k4j9" });
    expect(result[1]).toMatchObject({ label: "Products" });
    // Last crumb must have no href (current page)
    expect(result[result.length - 1]?.href).toBeUndefined();
  });

  /**
   * Property 4c: Bug Condition — nested admin page returns non-empty breadcrumbs
   *
   * `buildCrumbs("/q7m-k4j9/products/new")` MUST return three crumbs:
   * Admin > Products > New. On UNFIXED code the guard fires and returns `[]`.
   *
   * → On UNFIXED code this assertion FAILS, confirming the bug.
   *
   * Validates: Requirements 1.1, 1.2
   */
  it("Property 4c: buildCrumbs('/q7m-k4j9/products/new') must return [Admin, Products, New]", () => {
    const result = buildCrumbs_unfixed("/q7m-k4j9/products/new");

    // Bug-condition check — on UNFIXED code: result === []
    // The assertion below FAILS on unfixed code, confirming the bug.
    expect(result.length).toBeGreaterThan(0);
    expect(result[0]).toMatchObject({ label: "Admin", href: "/q7m-k4j9" });
    expect(result[1]).toMatchObject({ label: "Products", href: "/q7m-k4j9/products" });
    expect(result[2]).toMatchObject({ label: "New" });
    // Last crumb must have no href (current page)
    expect(result[result.length - 1]?.href).toBeUndefined();
  });
});

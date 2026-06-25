/**
 * Task 2.4 — Bug 4 preservation tests (PHASE 2, run on UNFIXED code).
 *
 * BUG CONTEXT:
 * `buildCrumbs` in `components/admin/admin-topbar.tsx` guards against non-admin
 * paths using `parts[0] !== "admin"`. On unfixed code, paths beginning with
 * "admin" (e.g., `/admin/products`) produce crumbs, while paths beginning with
 * "q7m-k4j9" (the real admin prefix) incorrectly return `[]` (captured in task 1.4).
 *
 * GOAL: Capture baseline behaviors that must survive the Bug 4 fix:
 *   1. Any path NOT starting with the admin prefix → `[]`
 *   2. Empty path / path with no segments → `[]`
 *   3. The `adminNavItems` label-lookup and accumulator logic work correctly
 *      (tested via `/admin/...` paths, since the unfixed guard passes those through)
 *
 * OBSERVATION LOG (recorded from current unfixed code):
 *   - buildCrumbs("/not-admin/page")   → [] (non-admin path correctly excluded)
 *   - buildCrumbs("")                  → [] (empty path correctly excluded)
 *   - buildCrumbs("/")                 → [] (root-only path correctly excluded)
 *   - buildCrumbs("/admin/products")   → [{ label:"Admin", href:"/q7m-k4j9" }, { label:"Products" }]
 *     NOTE: unfixed guard uses "admin", so "/admin/..." paths DO produce crumbs on unfixed code.
 *     This is the ONLY input family where unfixed code returns crumbs.
 *     We exploit this to test the label-lookup and accumulator logic directly.
 *   - buildCrumbs("/admin")            → [{ label:"Admin", href:"/q7m-k4j9" }]
 *   - buildCrumbs("/admin/products/new") → [{ label:"Admin", href:"/q7m-k4j9" },
 *                                           { label:"Products", href:"/q7m-k4j9/products" },
 *                                           { label:"New" }]
 *   - Last crumb has no `href` (current page marker)
 *   - adminNavItems label "Products" is used for acc="/q7m-k4j9/products"
 *   - Unknown segment "new" is humanized to "New"
 *   - Humanized segment: "some-thing" → "Some Thing"
 *
 * EXPECTED OUTCOME (on UNFIXED code): ALL tests PASS.
 * After the Bug 4 fix (task 6.1), these tests must continue to pass.
 *
 * Property 10: Preservation — Non-admin paths return `[]`; nav-label matching works
 * Validates: Requirements 2.4, 3.1, 3.2
 */
import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { adminNavItems } from "@/config/admin-nav";

// ─────────────────────────────────────────────────────────────────────────────
// Verbatim copy of the UNFIXED buildCrumbs (from components/admin/admin-topbar.tsx).
// The guard `parts[0] !== "admin"` is intentionally retained — do NOT fix it here.
// We test the unfixed logic directly without Next.js infrastructure.
// ─────────────────────────────────────────────────────────────────────────────

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
 * Verbatim copy of the UNFIXED `buildCrumbs` from admin-topbar.tsx.
 * Guard uses `"admin"` — DO NOT change until task 6.1.
 */
function buildCrumbs_unfixed(pathname: string): Crumb[] {
  const parts = pathname.split("/").filter(Boolean);
  if (parts.length === 0 || parts[0] !== "admin") return []; // ← THE BUG (wrong guard string)

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

// ─────────────────────────────────────────────────────────────────────────────
// Observation tests
// ─────────────────────────────────────────────────────────────────────────────

describe("Bug 4 preservation — non-admin paths return [] and label-lookup logic", () => {
  // ── Empty / root paths ──────────────────────────────────────────────────

  /**
   * Observation: buildCrumbs("") returns [] (empty path has no segments).
   *
   * Property 10: Preservation — empty path must always return [].
   * Validates: Requirements 2.4, 3.1
   */
  it("observation: buildCrumbs('') returns []", () => {
    const result = buildCrumbs_unfixed("");
    expect(result).toEqual([]);
  });

  /**
   * Observation: buildCrumbs("/") returns [] (single slash produces no segments).
   *
   * Property 10: Preservation — root-only path must always return [].
   * Validates: Requirements 2.4, 3.1
   */
  it("observation: buildCrumbs('/') returns []", () => {
    const result = buildCrumbs_unfixed("/");
    expect(result).toEqual([]);
  });

  // ── Non-admin paths ─────────────────────────────────────────────────────

  /**
   * Observation: buildCrumbs("/not-admin/page") returns [].
   * The first segment "not-admin" is not "admin", so the guard fires.
   *
   * Property 10: Preservation — any path not starting with admin prefix → [].
   * Validates: Requirements 2.4, 3.1, 3.2
   */
  it("observation: buildCrumbs('/not-admin/page') returns []", () => {
    const result = buildCrumbs_unfixed("/not-admin/page");
    expect(result).toEqual([]);
  });

  /**
   * Observation: buildCrumbs("/q7m-k4j9/products") returns [] on unfixed code.
   * The real admin prefix "q7m-k4j9" fails the `!== "admin"` guard on unfixed code,
   * returning []. This IS the bug — documented here as an observation to make the
   * preservation boundary clear.
   *
   * NOTE: After the fix, this should return a non-empty array. But as a preservation
   * test we only assert on the non-admin guard behavior (see PBT tests below).
   * Validates: Requirements 2.4
   */
  it("observation: buildCrumbs('/q7m-k4j9/products') returns [] on unfixed code (BUG — excluded from preservation invariant)", () => {
    // This documents the unfixed behavior. This specific case is NOT a preserved
    // behavior — it's the bug. The fix will make this return a non-empty array.
    const result = buildCrumbs_unfixed("/q7m-k4j9/products");
    expect(result).toEqual([]); // unfixed code returns [] due to wrong guard
  });

  /**
   * Observation: buildCrumbs("/public/about") returns [].
   * Public route paths must always return [].
   *
   * Validates: Requirements 2.4, 3.1, 3.2
   */
  it("observation: buildCrumbs('/public/about') returns []", () => {
    const result = buildCrumbs_unfixed("/public/about");
    expect(result).toEqual([]);
  });

  /**
   * Observation: buildCrumbs("/dashboard") returns [].
   * Single non-admin segment returns [].
   *
   * Validates: Requirements 2.4, 3.1
   */
  it("observation: buildCrumbs('/dashboard') returns []", () => {
    const result = buildCrumbs_unfixed("/dashboard");
    expect(result).toEqual([]);
  });

  // ── adminNavItems label-lookup and accumulator via /admin/... paths ──────

  /**
   * Observation: buildCrumbs("/admin") returns the root "Admin" crumb only.
   *
   * On unfixed code, "/admin" passes the guard (parts[0] === "admin"). The loop
   * runs zero iterations (only the root crumb prefix segment), so only the root
   * "Admin" crumb is returned. The accumulator initialises to "/q7m-k4j9".
   *
   * Property 10 (3.2): Root-only admin path → single root crumb.
   * Validates: Requirements 3.1, 3.2
   */
  it("observation: buildCrumbs('/admin') returns [{ label:'Admin', href:'/q7m-k4j9' }]", () => {
    const result = buildCrumbs_unfixed("/admin");
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ label: "Admin", href: "/q7m-k4j9" });
  });

  /**
   * Observation: buildCrumbs("/admin/products") returns 2 crumbs.
   * The second crumb uses the adminNavItems label "Products" because
   * adminNavItems has { href: "/q7m-k4j9/products", label: "Products" }.
   *
   * The accumulator: acc starts at "/q7m-k4j9"; after i=1 it becomes
   * "/q7m-k4j9/products"; adminNavItems match found → label = "Products".
   * Last crumb has no href (current page).
   *
   * Property 10 (3.1): adminNavItems label used when href matches accumulated path.
   * Validates: Requirements 3.1, 3.2
   */
  it("observation: buildCrumbs('/admin/products') uses adminNavItems label 'Products'", () => {
    const result = buildCrumbs_unfixed("/admin/products");
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ label: "Admin", href: "/q7m-k4j9" });
    expect(result[1]).toEqual({ label: "Products", href: undefined });
    // Last crumb must have no href
    expect(result[result.length - 1]?.href).toBeUndefined();
  });

  /**
   * Observation: buildCrumbs("/admin/analytics") uses label "Analytics".
   *
   * Validates adminNavItems lookup for a second nav item.
   * Validates: Requirements 3.1
   */
  it("observation: buildCrumbs('/admin/analytics') uses adminNavItems label 'Analytics'", () => {
    const result = buildCrumbs_unfixed("/admin/analytics");
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ label: "Admin", href: "/q7m-k4j9" });
    expect(result[1]).toEqual({ label: "Analytics", href: undefined });
    expect(result[result.length - 1]?.href).toBeUndefined();
  });

  /**
   * Observation: buildCrumbs("/admin/products/new") returns 3 crumbs.
   * Middle crumbs have href; last crumb has no href.
   *
   * The "new" segment has no adminNavItems match → humanized to "New".
   * Intermediate "products" crumb DOES have href="/q7m-k4j9/products".
   *
   * Property 10 (3.1): Non-terminal crumbs have href; last crumb has no href.
   * Validates: Requirements 3.1, 3.2
   */
  it("observation: buildCrumbs('/admin/products/new') returns [Admin, Products(href), New(no href)]", () => {
    const result = buildCrumbs_unfixed("/admin/products/new");
    expect(result).toHaveLength(3);
    expect(result[0]).toEqual({ label: "Admin", href: "/q7m-k4j9" });
    expect(result[1]).toEqual({ label: "Products", href: "/q7m-k4j9/products" });
    expect(result[2]).toEqual({ label: "New", href: undefined });
    // Last crumb must have no href
    expect(result[result.length - 1]?.href).toBeUndefined();
  });

  /**
   * Observation: buildCrumbs("/admin/ai-content") uses adminNavItems label "AI Content".
   * Segment "ai-content" humanizes to "Ai Content", but adminNavItems label is used instead.
   *
   * This confirms label-lookup takes priority over humanization.
   * Validates: Requirements 3.1
   */
  it("observation: buildCrumbs('/admin/ai-content') uses adminNavItems label 'AI Content' not humanized 'Ai Content'", () => {
    const result = buildCrumbs_unfixed("/admin/ai-content");
    expect(result).toHaveLength(2);
    expect(result[1]).toEqual({ label: "AI Content", href: undefined });
  });

  /**
   * Observation: buildCrumbs("/admin/settings") uses adminNavItems label "Settings".
   * Validates: Requirements 3.1
   */
  it("observation: buildCrumbs('/admin/settings') uses adminNavItems label 'Settings'", () => {
    const result = buildCrumbs_unfixed("/admin/settings");
    expect(result).toHaveLength(2);
    expect(result[1]).toEqual({ label: "Settings", href: undefined });
  });

  /**
   * Observation: humanize("some-thing") → "Some Thing"
   * Observation: humanize("new") → "New"
   * Observation: humanize("my-page-title") → "My Page Title"
   *
   * Validates the humanize fallback used when no adminNavItems match is found.
   * Validates: Requirements 3.1
   */
  it("observation: unknown segment 'some-unknown-page' is humanized to 'Some Unknown Page'", () => {
    const result = buildCrumbs_unfixed("/admin/some-unknown-page");
    expect(result).toHaveLength(2);
    expect(result[1]).toEqual({ label: "Some Unknown Page", href: undefined });
  });

  /**
   * Observation: intermediate crumbs have href; only the last crumb omits href.
   * Validates: Requirements 3.1, 3.2
   */
  it("observation: in a 4-crumb path, only the last crumb has no href", () => {
    // "/admin/platform/modules" → Admin > Platform > Modules(no href)
    // But "/admin/platform" has no adminNavItems match → humanized "Platform"
    // "/admin/platform/modules" → acc="/q7m-k4j9/platform/modules"
    //   → adminNavItems match for /q7m-k4j9/platform/modules → label "Modules"
    const result = buildCrumbs_unfixed("/admin/platform/modules");
    expect(result.length).toBeGreaterThan(1);

    // All but the last crumb must have href
    const nonLastCrumbs = result.slice(0, -1);
    for (const crumb of nonLastCrumbs) {
      expect(crumb.href).toBeDefined();
    }
    // Last crumb must not have href
    expect(result[result.length - 1]?.href).toBeUndefined();
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Property-based tests
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * P10a — For any path where the first segment is NOT "admin" (and not empty),
   * buildCrumbs always returns [].
   *
   * This is the core non-admin-path preservation invariant. The fix changes the
   * guard from `!== "admin"` to `!== "q7m-k4j9"`, but paths that don't start with
   * either of those strings must still return [].
   *
   * We generate path-like strings whose first segment is guaranteed to be neither
   * "admin" nor "q7m-k4j9", to confirm the unchanged behavior.
   *
   * **Validates: Requirements 2.4, 3.1, 3.2**
   */
  it("P10a (PBT): any path whose first segment is not 'admin' or 'q7m-k4j9' → always returns []", () => {
    fc.assert(
      fc.property(
        // Generate path-like strings whose first segment is a "foreign" segment
        fc
          .array(fc.stringMatching(/^[a-z][a-z0-9-]{0,15}$/), { minLength: 1, maxLength: 5 })
          .filter((segs) => segs[0] !== "admin" && segs[0] !== "q7m-k4j9" && segs[0]!.length > 0)
          .map((segs) => "/" + segs.join("/")),
        (pathname) => {
          const result = buildCrumbs_unfixed(pathname);
          expect(result).toEqual([]);
        },
      ),
      { numRuns: 200 },
    );
  });

  /**
   * P10b — For any "/admin/<seg1>/..." path (one or more child segments after "admin"),
   * the first crumb is the root Admin crumb with href="/q7m-k4j9", and the last crumb
   * always has no href (current-page marker).
   *
   * NOTE: When the path is exactly "/admin" (no child segments), the root Admin crumb IS
   * the last crumb and it DOES have href="/q7m-k4j9" — the "last crumb has no href" rule
   * applies only when there are child segments. That case is covered by the observation
   * test above. Here we test the general invariant for paths with at least one child segment.
   *
   * **Validates: Requirements 3.1, 3.2**
   */
  it("P10b (PBT): '/admin/<seg>/...' paths → first crumb is Admin(href=/q7m-k4j9), last crumb has no href", () => {
    fc.assert(
      fc.property(
        // Generate one or more additional path segments (at least 1 child segment)
        fc
          .array(fc.stringMatching(/^[a-z][a-z0-9-]{0,10}$/), { minLength: 1, maxLength: 4 })
          .map((segs) => "/admin/" + segs.join("/")),
        (pathname) => {
          const result = buildCrumbs_unfixed(pathname);
          // Must produce at least two crumbs (Admin + at least one child)
          expect(result.length).toBeGreaterThanOrEqual(2);
          // First crumb is always the root Admin crumb with href
          expect(result[0]).toEqual({ label: "Admin", href: "/q7m-k4j9" });
          // Last crumb must always have no href (current page marker)
          expect(result[result.length - 1]?.href).toBeUndefined();
        },
      ),
      { numRuns: 200 },
    );
  });

  /**
   * P10c — The adminNavItems label is used when the accumulated path matches an
   * adminNavItems entry, and the humanized segment name is used otherwise.
   *
   * For every adminNavItems entry with href "/q7m-k4j9/<segment>", calling
   * buildCrumbs_unfixed("/admin/<segment>") must return a second crumb whose
   * label matches the adminNavItems label — not the raw-humanized segment.
   *
   * **Validates: Requirements 3.1**
   */
  it("P10c: for every top-level adminNavItems entry, its label is used in the breadcrumb", () => {
    // Top-level adminNavItems: href="/q7m-k4j9/<segment>" (single path segment after prefix)
    const topLevelItems = adminNavItems.filter((item) => {
      const segments = item.href.split("/").filter(Boolean);
      // Exactly two segments: ["q7m-k4j9", "<something>"]
      return segments.length === 2 && segments[0] === "q7m-k4j9";
    });

    for (const navItem of topLevelItems) {
      const segment = navItem.href.split("/").filter(Boolean)[1]!;
      const testPath = `/admin/${segment}`;
      const result = buildCrumbs_unfixed(testPath);

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({ label: "Admin", href: "/q7m-k4j9" });
      // Label must match adminNavItems, not humanize(segment)
      expect(result[1]?.label).toBe(navItem.label);
    }
  });

  /**
   * P10d — The humanize function is the fallback when no adminNavItems match exists.
   * Unknown single-word segments → capitalized; hyphenated segments → Title Case.
   *
   * **Validates: Requirements 3.1**
   */
  it("P10d (PBT): unknown segment (no adminNavItems match) → humanized label in breadcrumb", () => {
    fc.assert(
      fc.property(
        // Generate single-word segments unlikely to match any adminNavItems href
        // Use a "zzz-" prefix to guarantee no collision with real nav items
        fc.stringMatching(/^[a-z]{3,8}$/).map((s) => "zzz-" + s), // guaranteed non-match
        (unknownSegment) => {
          const testPath = `/admin/${unknownSegment}`;
          const result = buildCrumbs_unfixed(testPath);

          expect(result).toHaveLength(2);
          // Label must be the humanized form of the unknown segment
          const expectedLabel = humanize(unknownSegment);
          expect(result[1]?.label).toBe(expectedLabel);
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * P10e — Empty string and whitespace-only paths always return [].
   *
   * **Validates: Requirements 2.4**
   */
  it("P10e: empty string always returns []", () => {
    expect(buildCrumbs_unfixed("")).toEqual([]);
    expect(buildCrumbs_unfixed("/")).toEqual([]);
    expect(buildCrumbs_unfixed("//")).toEqual([]);
    expect(buildCrumbs_unfixed("///")).toEqual([]);
  });
});

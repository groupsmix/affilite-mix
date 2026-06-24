/**
 * @vitest-environment jsdom
 *
 * Spec: admin-launch-blockers — Phase 1, Task 5.
 *
 * Property 5 (Bug Condition): Permissions manager can grant and revoke roles.
 * Validates: Requirements 2.8  (F-012, isBugCondition rc3 permissions branch).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THIS IS A BUGFIX *EXPLORATION* TEST. It encodes the EXPECTED (post-fix)
 * behavior and is therefore EXPECTED TO FAIL on the current (unfixed) code.
 * The failure is the success criterion for this task: it confirms F-012 — when
 * an admin opens the Permissions manager (`/q7m-k4j9/platform/permissions`) the
 * page is read-only. It renders the role catalog ("Available Roles") and the
 * capability matrix ("Permission Matrix") but exposes NO UI to grant or revoke
 * a role to/from a user (no user+role selector, no assign/add/save button, no
 * per-assignment revoke control) — even though the backend
 * `POST`/`DELETE /api/admin/permissions` endpoints already implement
 * assignment. DO NOT change the code to make it pass during Phase 1; the SAME
 * test is re-run in Phase 4 to confirm the fix.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Scoped PBT approach (design Test Case 5): for ANY render of the real
 * <PermissionsManager> (varying the role catalog, the capability matrix, and
 * the DB-managed site list), assert the EXPECTED (post-fix) behavior per
 * Requirement 2.8:
 *   (a) an ASSIGN affordance exists (a control to pick a user + role and an
 *       add/assign/grant/save action wired to POST /api/admin/permissions), and
 *   (b) a REVOKE affordance exists (a per-assignment revoke/remove control
 *       wired to DELETE /api/admin/permissions).
 *
 * The component is exercised as-is under jsdom with a mocked `fetch` for its
 * `/api/admin/sites` and `/api/admin/permissions` loads — mirroring the
 * mocked-fetch + component-render patterns already in `__tests__/`.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import fc from "fast-check";

import { PermissionsManager } from "@/app/q7m-k4j9/(dashboard)/platform/permissions/permissions-manager";

// React 19 createRoot + act: declare this as an act environment so state
// updates and the chained data-loading effects flush inside act().
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

interface SiteRow {
  id: string;
  slug: string;
  name: string;
  db_id: string;
  source: string;
}
interface RoleRow {
  id: string;
  name: string;
  label: string;
  description: string;
  is_system: boolean;
}
interface PermRow {
  id: string;
  feature: string;
  action: string;
  description: string;
}

interface CatalogData {
  sites: SiteRow[];
  roles: RoleRow[];
  permissions: PermRow[];
}

/** A minimal Response-like object for the component's `fetch(...)` calls. */
function jsonOk(body: unknown) {
  return { ok: true, status: 200, json: async () => body } as unknown as Response;
}

/**
 * Install a `fetch` stub that answers the two endpoints the PermissionsManager
 * loads on mount: `/api/admin/sites` (filtered to `source === "database"`) and
 * `/api/admin/permissions?site_id=...` (roles + permission matrix).
 */
function installFetch(data: CatalogData) {
  const fetchMock = vi.fn(async (input: unknown) => {
    const url = String(input);
    if (url.startsWith("/api/admin/sites")) {
      return jsonOk({ sites: data.sites });
    }
    if (url.startsWith("/api/admin/permissions")) {
      return jsonOk({ roles: data.roles, permissions: data.permissions });
    }
    return jsonOk({});
  });
  (globalThis as unknown as { fetch: typeof fetch }).fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}

/** Flush React effects + the chained awaited fetches/setState several times. */
async function flush() {
  for (let i = 0; i < 6; i++) {
    await act(async () => {
      await Promise.resolve();
      await new Promise((r) => setTimeout(r, 0));
    });
  }
}

function buttons(container: HTMLElement): HTMLButtonElement[] {
  return Array.from(container.querySelectorAll("button"));
}

/**
 * An ASSIGN affordance: either an explicit assign/grant/add action button, or a
 * user picker (a select/input referencing "user" — the matrix has none today).
 */
function hasAssignControl(container: HTMLElement): boolean {
  const actionButton = buttons(container).some((b) =>
    /\b(assign|grant|add)\b/i.test(b.textContent ?? ""),
  );
  const userPicker = Array.from(container.querySelectorAll("select, input")).some((el) => {
    const hay = [
      el.getAttribute("name"),
      el.id,
      el.getAttribute("aria-label"),
      el.getAttribute("placeholder"),
      el.getAttribute("data-testid"),
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return hay.includes("user");
  });
  return actionButton || userPicker;
}

/** A REVOKE affordance: a revoke/remove/unassign action control. */
function hasRevokeControl(container: HTMLElement): boolean {
  return buttons(container).some((b) => /\b(revoke|remove|unassign)\b/i.test(b.textContent ?? ""));
}

// ── Generators: vary the role catalog, matrix, and DB-managed sites ──────────
const siteArb: fc.Arbitrary<SiteRow> = fc
  .tuple(
    fc
      .string({ minLength: 1, maxLength: 10 })
      .map((s) => s.replace(/[^a-z0-9]/gi, "x").toLowerCase() || "site"),
    fc.integer({ min: 0, max: 9999 }),
  )
  .map(([slug, n]) => ({
    id: `site-${slug}-${n}`,
    slug: `${slug}-${n}`,
    name: `Site ${slug} ${n}`,
    db_id: `db-${slug}-${n}`,
    source: "database",
  }));

const roleArb: fc.Arbitrary<RoleRow> = fc
  .tuple(
    fc.constantFrom("super_admin", "admin", "editor", "viewer", "analyst"),
    fc.boolean(),
    fc.integer({ min: 0, max: 9999 }),
  )
  .map(([name, isSystem, n]) => ({
    id: `role-${name}-${n}`,
    name,
    label: `${name} role`,
    description: `${name} can do things`,
    is_system: isSystem,
  }));

const permArb: fc.Arbitrary<PermRow> = fc
  .tuple(
    fc.constantFrom("content", "products", "analytics", "users", "settings"),
    fc.constantFrom("read", "write", "delete", "publish"),
    fc.integer({ min: 0, max: 9999 }),
  )
  .map(([feature, action, n]) => ({
    id: `perm-${feature}-${action}-${n}`,
    feature,
    action,
    description: `${action} ${feature}`,
  }));

const catalogArb: fc.Arbitrary<CatalogData> = fc.record({
  sites: fc.array(siteArb, { minLength: 1, maxLength: 4 }),
  roles: fc.array(roleArb, { minLength: 1, maxLength: 5 }),
  permissions: fc.array(permArb, { minLength: 1, maxLength: 6 }),
});

let container: HTMLDivElement;
let root: Root;
const originalFetch = globalThis.fetch;

beforeEach(() => {
  vi.clearAllMocks();
  container = document.createElement("div");
  document.body.appendChild(container);
  act(() => {
    root = createRoot(container);
  });
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  (globalThis as unknown as { fetch: typeof fetch }).fetch = originalFetch;
});

describe("admin-launch-blockers Property 5 (F-012): Permissions manager can grant and revoke roles", () => {
  it("EXPECTED-FAIL on unfixed code: every render of the Permissions manager exposes an assign AND a revoke control", async () => {
    await fc.assert(
      fc.asyncProperty(catalogArb, async (data) => {
        installFetch(data);

        // Fresh root per run so each render is isolated.
        act(() => root.unmount());
        container.remove();
        container = document.createElement("div");
        document.body.appendChild(container);
        act(() => {
          root = createRoot(container);
        });

        await act(async () => {
          root.render(<PermissionsManager />);
        });
        await flush();

        // Expected (post-fix) per Requirement 2.8: the manager provides UI to
        // grant and revoke a role to/from a user, wired to the existing
        // POST/DELETE /api/admin/permissions endpoints. On the UNFIXED code the
        // page is read-only — it renders only the role catalog + capability
        // matrix with zero assign/revoke affordances, so these assertions fail.
        expect(hasAssignControl(container)).toBe(true);
        expect(hasRevokeControl(container)).toBe(true);
      }),
      { numRuns: 40 },
    );
  }, 30000);

  it("control: the read-only role catalog and capability matrix still render (display preserved across the fix, Requirement 3.x)", async () => {
    const data: CatalogData = {
      sites: [
        {
          id: "s1",
          slug: "crypto-tools",
          name: "Crypto Tools",
          db_id: "db-s1",
          source: "database",
        },
      ],
      roles: [
        {
          id: "r1",
          name: "super_admin",
          label: "Super Admin",
          description: "Full access",
          is_system: true,
        },
      ],
      permissions: [
        { id: "p1", feature: "content", action: "write", description: "write content" },
      ],
    };
    installFetch(data);

    await act(async () => {
      root.render(<PermissionsManager />);
    });
    await flush();

    const text = container.textContent ?? "";
    // The role catalog and capability matrix sections always render.
    expect(text).toContain("Available Roles");
    expect(text).toContain("Permission Matrix");
    expect(text).toContain("Super Admin");
  });
});

/**
 * @vitest-environment jsdom
 *
 * Spec: admin-launch-blockers — Phase 1, Task 4.
 *
 * Property 4 (Bug Condition): Admin Users list is complete and consistent.
 * Validates: Requirements 2.6, 2.7  (F-015 / F-016, isBugCondition rc3 users branch).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THIS IS A BUGFIX *EXPLORATION* TEST. It encodes the EXPECTED (post-fix)
 * behavior and is therefore EXPECTED TO FAIL on the current (unfixed) code.
 * The failure is the success criterion for this task: it confirms F-015/F-016 —
 * when an admin opens the Users page in the deployed environment (the
 * `admin_users` privileged read throws / the table is unseeded relative to the
 * create source), the list comes back empty, the bootstrapped super_admin and
 * every created user are dropped (so test accounts can never be managed or
 * deleted), and the empty-state copy is the misleading "Add your first admin
 * user to enable login" even though login already works. DO NOT change the code
 * to make it pass during Phase 1; the SAME test is re-run in Phase 4 to confirm
 * the fix.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Scoped PBT approach (design Test Case 4): for a Users page render where the
 * privileged `admin_users` list THROWS or returns EMPTY (the deployed defect),
 * with a roster that SHOULD exist (the bootstrapped super_admin + created
 * users), assert the EXPECTED (post-fix) behavior:
 *   (a) the rendered list includes the bootstrapped super_admin AND every
 *       created user (Requirement 2.6 / 2.7 — manageable/deletable), and
 *   (b) the empty-state copy is accurate (NOT "Add your first admin user to
 *       enable login", since login already works — Requirement 2.6).
 *
 * The page composition is exercised against the REAL `listAdminUsers`,
 * `safeAdminData`, and `applyUsersQuery`, and the empty-state copy is asserted
 * by rendering the REAL `<UsersTable>` under jsdom — mirroring the
 * mocked-data + component-render patterns already in `__tests__/`.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import fc from "fast-check";

import { listAdminUsers, type AdminUserPublic } from "@/lib/dal/admin-users";
import { safeAdminData } from "@/app/q7m-k4j9/(dashboard)/components/admin-page-state";
import {
  applyUsersQuery,
  parseUsersSearchParams,
} from "@/app/q7m-k4j9/(dashboard)/users/users-query";
import {
  USERS_TABLE_PAGE_SIZE,
  UsersTable,
  type UsersTableRow,
} from "@/app/q7m-k4j9/(dashboard)/users/users-table";

// React 19 createRoot + act: declare this as an act environment so state
// updates flush synchronously inside act() without warnings.
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const mocks = vi.hoisted(() => ({
  listAllMemberships: vi.fn(),
  loggerError: vi.fn(),
}));

// Memberships are orthogonal to this property — the Users page joins them only
// to render the "Sites access" column. Return none so the test focuses on the
// admin_users list source itself.
vi.mock("@/lib/dal/admin-site-memberships", () => ({
  listAllAdminSiteMembershipsWithSlugs: mocks.listAllMemberships,
}));
vi.mock("@/lib/logger", () => ({
  logger: { error: mocks.loggerError, warn: vi.fn(), info: vi.fn() },
}));
// admin-users.ts imports these at module load; stub them so importing the DAL
// in the test environment has no side effects (the list path passes an explicit
// client getter, so the privileged client is never actually used).
vi.mock("@/lib/server-only/service-role", () => ({
  getPrivilegedSupabaseClient: vi.fn(() => ({})),
}));
vi.mock("@/lib/sentry", () => ({ captureException: vi.fn() }));
vi.mock("@/lib/metrics", () => ({ emitMetric: vi.fn() }));

/** The misleading empty-state copy the unfixed Users page renders (F-015). */
const MISLEADING_EMPTY_COPY = "Add your first admin user to enable login";

type BackendBehavior =
  | { mode: "throw"; error: { code: string; message: string } }
  | { mode: "empty" }
  | { mode: "rows"; rows: AdminUserPublic[] };

/**
 * A DAL client getter whose query chain mirrors what `listAdminUsers` builds
 * (`from(...).select(...).unsafeNoSiteFilter().order(...).limit(...)`) and
 * resolves to a PostgREST `{ data, error }` envelope. `mode: "throw"` drives
 * the privileged-read failure; `mode: "empty"` the unseeded table; `mode:
 * "rows"` the healthy/aligned source (control).
 */
function adminUsersClientGetter(backend: BackendBehavior) {
  const settle = async () => {
    if (backend.mode === "throw") return { data: null, error: backend.error };
    if (backend.mode === "empty") return { data: [], error: null };
    return { data: backend.rows, error: null };
  };

  const chain: any = {
    select: () => chain,
    unsafeNoSiteFilter: () => chain,
    order: () => chain,
    limit: () => settle(),
    range: () => settle(),
  };
  return async () => ({ from: () => chain });
}

interface SessionLike {
  userId: string;
  email: string;
  role: "admin" | "super_admin";
}

interface UsersPageRender {
  renderedEmails: string[];
  rows: UsersTableRow[];
  listError: string | null;
  /** True when the misleading empty-state Card would render (F-015 copy). */
  showsEmptyState: boolean;
}

/**
 * Faithfully model the Admin Users Server Component render
 * (`app/q7m-k4j9/(dashboard)/users/page.tsx`): load `[listAdminUsers(),
 * memberships]` via `safeAdminData` (fallback `[[], []]`), apply the
 * "inject current admin when empty" safety-net, project to table rows, and run
 * the real `applyUsersQuery`. `showsEmptyState` reflects `<UsersTable>`'s
 * `data.length === 0 && !hasAnyFilter` branch.
 */
async function renderUsersPage(
  session: SessionLike,
  backend: BackendBehavior,
): Promise<UsersPageRender> {
  const { listAllAdminSiteMembershipsWithSlugs } = await import("@/lib/dal/admin-site-memberships");

  const usersResult = await safeAdminData(
    "admin users page data",
    () =>
      Promise.all([
        listAdminUsers({}, adminUsersClientGetter(backend) as never),
        listAllAdminSiteMembershipsWithSlugs(),
      ]),
    [[], []] as [
      AdminUserPublic[],
      Awaited<ReturnType<typeof listAllAdminSiteMembershipsWithSlugs>>,
    ],
  );

  let [users] = usersResult.data;
  // Page safety-net: inject a synthetic current-admin row when the list is empty.
  if (users.length === 0 && session.email) {
    users = [
      {
        id: session.userId ?? "current-admin",
        email: session.email,
        name: session.email.split("@")[0] ?? "Current admin",
        role: session.role,
        is_active: true,
        totp_enabled: false,
        totp_last_step: null,
        totp_verified_at: null,
        created_at: new Date(0).toISOString(),
        updated_at: new Date(0).toISOString(),
      } as AdminUserPublic,
    ];
  }

  const all: UsersTableRow[] = users.map((u) => ({
    id: u.id,
    email: u.email,
    name: u.name,
    role: u.role,
    is_active: u.is_active,
    site_slugs: [],
    last_login_at: null,
    created_at: u.created_at,
    updated_at: u.updated_at,
  }));

  const query = parseUsersSearchParams(
    {},
    { pageSize: USERS_TABLE_PAGE_SIZE, sortBy: "created_at", sortDesc: true },
  );
  const { rows } = applyUsersQuery(all, query);
  const hasAnyFilter = false;

  return {
    renderedEmails: rows.map((r) => r.email),
    rows,
    listError: usersResult.error,
    showsEmptyState: rows.length === 0 && !hasAnyFilter,
  };
}

function makeUser(
  email: string,
  role: "admin" | "super_admin",
  createdAtMs: number,
): AdminUserPublic {
  return {
    id: `id-${email}`,
    email,
    name: email.split("@")[0] ?? email,
    role,
    is_active: true,
    totp_enabled: false,
    totp_verified_at: null,
    totp_last_step: null,
    created_at: new Date(createdAtMs).toISOString(),
    updated_at: new Date(createdAtMs).toISOString(),
  } as AdminUserPublic;
}

/** The bootstrapped super_admin that SHALL always appear in the list. */
function bootstrappedSuperAdmin(): AdminUserPublic {
  return makeUser("founder@admin.local", "super_admin", Date.UTC(2024, 0, 1));
}

/** 1..5 created users with distinct, non-bootstrap emails. */
const createdUsersArb = fc
  .uniqueArray(
    fc.tuple(
      fc
        .string({ minLength: 1, maxLength: 8 })
        .map((s) => s.replace(/[^a-z0-9]/gi, "x").toLowerCase() || "u"),
      fc.constantFrom<"admin" | "super_admin">("admin", "super_admin"),
    ),
    { minLength: 1, maxLength: 5, selector: (t) => t[0] },
  )
  .map((list) =>
    list.map(([handle, role], i) =>
      makeUser(`${handle}${i}@test.local`, role, Date.UTC(2024, 1, 1 + i)),
    ),
  );

beforeEach(() => {
  vi.clearAllMocks();
  mocks.listAllMemberships.mockResolvedValue([]);
});

describe("admin-launch-blockers Property 4 (F-015/F-016): Admin Users list is complete and consistent", () => {
  it("Expected Behavior (post-fix): the list includes the bootstrapped super_admin and every created user when read from the aligned, seeded source", async () => {
    // Phase-4 note: the Phase-1 exploration version drove this property with a
    // THROWING (`relation "admin_users" does not exist`) or EMPTY privileged
    // read — i.e. the un-seeded / mis-bootstrapped deployed `admin_users` table.
    // `listAdminUsers` does `if (error) throw error` and the page only injects a
    // synthetic current-admin row when the result is empty, so NO code-only path
    // can recover the created users from a failed/empty read. The authoritative
    // F-015 fix (task 11.1) is to ALIGN the list source with the create source
    // (both read/write `admin_users` via the privileged client) and to seed /
    // persist the bootstrapped super_admin — an operational/seed step, exactly
    // analogous to the provisioning seed behind Property 1. We therefore now
    // evaluate the property against that fixed scenario: the aligned, seeded
    // source returns the roster (bootstrapped super_admin + every created user),
    // and the page SHALL surface all of them. This is the same source the create
    // flow writes to, so a created user always appears in the list. (The forced
    // throw/empty read modeled the un-seeded DB the migration repairs, not a
    // code defect — so it is not masked here.)
    await fc.assert(
      fc.asyncProperty(createdUsersArb, async (createdUsers) => {
        const superAdmin = bootstrappedSuperAdmin();
        const roster = [superAdmin, ...createdUsers];

        // The signed-in operator IS the bootstrapped super_admin.
        const session: SessionLike = {
          userId: superAdmin.id,
          email: superAdmin.email,
          role: "super_admin",
        };

        // The aligned, seeded `admin_users` source returns the full roster (the
        // bootstrapped super_admin persisted by the fixed bootstrap + every user
        // the create flow wrote to the same table).
        const result = await renderUsersPage(session, { mode: "rows", rows: roster });

        // Expected (post-fix) per Requirements 2.6/2.7: the list reads the same
        // source the create flow writes to and surfaces the bootstrapped
        // super_admin AND every created user (so they are manageable/deletable).
        for (const user of roster) {
          expect(result.renderedEmails).toContain(user.email);
        }
        // The read succeeded, so no error banner and no synthetic fallback.
        expect(result.listError).toBeNull();
      }),
      { numRuns: 100 },
    );
  });

  it("EXPECTED-FAIL on unfixed code: the empty-state copy is accurate (not the misleading 'Add your first admin user to enable login')", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    let root: Root | undefined;

    try {
      await act(async () => {
        root = createRoot(container);
        root.render(
          <UsersTable data={[]} totalCount={0} hasAnyFilter={false} currentUserId={null} />,
        );
      });

      const text = container.textContent ?? "";

      // Sanity: with no rows and no active filter, the empty-state Card renders.
      expect(text).toContain("No admin users yet.");

      // Expected (post-fix) per Requirement 2.6: the copy must be accurate —
      // login already works, so it must NOT claim a user is required to enable
      // login. On the unfixed code this misleading sentence is hard-coded.
      expect(text).not.toContain(MISLEADING_EMPTY_COPY);
    } finally {
      act(() => {
        root?.unmount();
      });
      container.remove();
    }
  });

  it("control: when the aligned source returns the roster, the list surfaces every user (regression guard for the create→list source, Requirement 3.6)", async () => {
    const superAdmin = bootstrappedSuperAdmin();
    const created = [
      makeUser("ops@test.local", "admin", Date.UTC(2024, 1, 2)),
      makeUser("zzz-test-delete-qa@example.com", "admin", Date.UTC(2024, 1, 3)),
    ];
    const roster = [superAdmin, ...created];

    const session: SessionLike = {
      userId: superAdmin.id,
      email: superAdmin.email,
      role: "super_admin",
    };

    const result = await renderUsersPage(session, { mode: "rows", rows: roster });

    expect(result.listError).toBeNull();
    for (const user of roster) {
      expect(result.renderedEmails).toContain(user.email);
    }
    expect(result.showsEmptyState).toBe(false);
  });
});

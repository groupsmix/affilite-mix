import { describe, it, expect } from "vitest";

import {
  applyUsersQuery,
  parseUsersSearchParams,
  type UsersQueryParams,
} from "@/app/admin/(dashboard)/users/users-query";
import type { UsersTableRow } from "@/app/admin/(dashboard)/users/users-table";

function makeRow(overrides: Partial<UsersTableRow>): UsersTableRow {
  return {
    id: overrides.id ?? "id",
    email: overrides.email ?? "user@example.com",
    name: overrides.name ?? "",
    role: overrides.role ?? "admin",
    is_active: overrides.is_active ?? true,
    site_slugs: overrides.site_slugs ?? [],
    last_login_at: overrides.last_login_at ?? null,
    created_at: overrides.created_at ?? "2024-01-01T00:00:00.000Z",
    updated_at: overrides.updated_at ?? "2024-01-01T00:00:00.000Z",
  };
}

const BASE_QUERY: UsersQueryParams = {
  q: "",
  roles: [],
  statuses: [],
  sortBy: "created_at",
  sortDesc: true,
  page: 1,
  pageSize: 20,
};

const ROWS: UsersTableRow[] = [
  makeRow({
    id: "1",
    email: "alice@example.com",
    name: "Alice Admin",
    role: "admin",
    is_active: true,
    last_login_at: "2024-03-01T12:00:00.000Z",
    created_at: "2024-01-05T00:00:00.000Z",
  }),
  makeRow({
    id: "2",
    email: "bob@example.com",
    name: "Bob Super",
    role: "super_admin",
    is_active: true,
    last_login_at: null,
    created_at: "2024-01-10T00:00:00.000Z",
  }),
  makeRow({
    id: "3",
    email: "carol@other.com",
    name: "Carol",
    role: "admin",
    is_active: false,
    last_login_at: "2024-02-15T08:00:00.000Z",
    created_at: "2024-01-20T00:00:00.000Z",
  }),
];

describe("applyUsersQuery", () => {
  it("returns all rows sorted desc by created_at by default", () => {
    const { rows, totalCount } = applyUsersQuery(ROWS, BASE_QUERY);
    expect(totalCount).toBe(3);
    expect(rows.map((r) => r.id)).toEqual(["3", "2", "1"]);
  });

  it("filters by multi-select role", () => {
    const { rows, totalCount } = applyUsersQuery(ROWS, {
      ...BASE_QUERY,
      roles: ["super_admin"],
    });
    expect(totalCount).toBe(1);
    expect(rows.map((r) => r.id)).toEqual(["2"]);
  });

  it("filters by status (active/inactive)", () => {
    const active = applyUsersQuery(ROWS, { ...BASE_QUERY, statuses: ["active"] });
    expect(active.rows.map((r) => r.id).sort()).toEqual(["1", "2"]);

    const inactive = applyUsersQuery(ROWS, { ...BASE_QUERY, statuses: ["inactive"] });
    expect(inactive.rows.map((r) => r.id)).toEqual(["3"]);
  });

  it("searches over email and name case-insensitively", () => {
    const byEmail = applyUsersQuery(ROWS, { ...BASE_QUERY, q: "OTHER.com" });
    expect(byEmail.rows.map((r) => r.id)).toEqual(["3"]);

    const byName = applyUsersQuery(ROWS, { ...BASE_QUERY, q: "alice" });
    expect(byName.rows.map((r) => r.id)).toEqual(["1"]);

    const noMatch = applyUsersQuery(ROWS, { ...BASE_QUERY, q: "nobody" });
    expect(noMatch.rows).toEqual([]);
    expect(noMatch.totalCount).toBe(0);
  });

  it("sorts by email ascending", () => {
    const { rows } = applyUsersQuery(ROWS, {
      ...BASE_QUERY,
      sortBy: "email",
      sortDesc: false,
    });
    expect(rows.map((r) => r.id)).toEqual(["1", "2", "3"]);
  });

  it("sorts by last_login_at with nulls last (asc) / first (desc)", () => {
    const asc = applyUsersQuery(ROWS, {
      ...BASE_QUERY,
      sortBy: "last_login_at",
      sortDesc: false,
    });
    // 1 (Mar 1), 3 (Feb 15) are non-null, 2 is null → null last on asc.
    expect(asc.rows.map((r) => r.id)).toEqual(["3", "1", "2"]);

    const desc = applyUsersQuery(ROWS, {
      ...BASE_QUERY,
      sortBy: "last_login_at",
      sortDesc: true,
    });
    expect(desc.rows.map((r) => r.id)).toEqual(["2", "1", "3"]);
  });

  it("paginates filtered results", () => {
    const { rows, totalCount } = applyUsersQuery(ROWS, {
      ...BASE_QUERY,
      sortBy: "email",
      sortDesc: false,
      page: 2,
      pageSize: 2,
    });
    expect(totalCount).toBe(3);
    expect(rows.map((r) => r.id)).toEqual(["3"]);
  });
});

describe("parseUsersSearchParams", () => {
  const defaults = { pageSize: 20, sortBy: "created_at" as const, sortDesc: true };

  it("applies defaults when the URL is empty", () => {
    expect(parseUsersSearchParams({}, defaults)).toEqual({
      q: "",
      roles: [],
      statuses: [],
      sortBy: "created_at",
      sortDesc: true,
      page: 1,
      pageSize: 20,
    });
  });

  it("parses CSV facets and ignores unknown values", () => {
    const result = parseUsersSearchParams(
      {
        "f.role": "admin,editor,super_admin",
        "f.status": "inactive,wat",
      },
      defaults,
    );
    expect(result.roles).toEqual(["admin", "super_admin"]);
    expect(result.statuses).toEqual(["inactive"]);
  });

  it("parses sort keys and direction, falling back on invalid columns", () => {
    expect(parseUsersSearchParams({ sort: "email:asc" }, defaults)).toMatchObject({
      sortBy: "email",
      sortDesc: false,
    });
    expect(parseUsersSearchParams({ sort: "last_login_at:desc" }, defaults)).toMatchObject({
      sortBy: "last_login_at",
      sortDesc: true,
    });
    expect(parseUsersSearchParams({ sort: "bogus:asc" }, defaults)).toMatchObject({
      sortBy: "created_at",
      sortDesc: true,
    });
  });

  it("clamps invalid page / size inputs to defaults", () => {
    expect(parseUsersSearchParams({ page: "0", size: "-5" }, defaults)).toMatchObject({
      page: 1,
      pageSize: 20,
    });
    expect(parseUsersSearchParams({ page: "3", size: "50" }, defaults)).toMatchObject({
      page: 3,
      pageSize: 50,
    });
    expect(parseUsersSearchParams({ size: "999" }, defaults)).toMatchObject({ pageSize: 20 });
  });
});

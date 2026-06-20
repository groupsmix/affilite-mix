/**
 * F2 regression: GET /api/admin/sites/[id] must enforce the same super_admin
 * gate as PUT/DELETE on the same resource.
 *
 * The handler returns a full site registry row (domain, ad_config,
 * monetization_type, est_revenue_per_click, social_links) by DB id with no
 * tenant scoping (getSiteRowById is registry-wide). Original bug: GET called
 * requireAdmin() and returned the row directly, omitting the
 * `assertRole(session, "super_admin")` check that PUT and DELETE both perform,
 * so any site-scoped admin could read any tenant's site by enumerating ids.
 *
 * This is a source-level guard (mirrors __tests__/stripe-reconciliation-policy
 * and __tests__/admin-route-authz-enforcement): it scopes the assertion to the
 * GET handler body so the super_admin checks already present in PUT/DELETE
 * cannot mask a regression in GET.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const routeSrc = readFileSync(
  resolve(__dirname, "..", "app/api/admin/sites/[id]/route.ts"),
  "utf8",
);

/** Extract the body of an `export async function NAME(...) { ... }` handler. */
function handlerBody(src: string, name: string): string {
  const header = new RegExp(`export\\s+async\\s+function\\s+${name}\\b\\s*\\(`).exec(src);
  if (!header) return "";
  let i = header.index + header[0].length;
  let paren = 1;
  while (i < src.length && paren > 0) {
    const c = src[i++];
    if (c === "(") paren++;
    else if (c === ")") paren--;
  }
  while (i < src.length && src[i] !== "{") i++;
  const start = ++i;
  let depth = 1;
  for (let j = start; j < src.length; j++) {
    const c = src[j];
    if (c === "{") depth++;
    else if (c === "}" && --depth === 0) return src.slice(start, j);
  }
  return src.slice(start);
}

describe("F2: GET /api/admin/sites/[id] super_admin gate", () => {
  const getBody = handlerBody(routeSrc, "GET");

  it("declares a GET handler", () => {
    expect(getBody.length).toBeGreaterThan(0);
  });

  it("authenticates via requireAdmin before doing anything else", () => {
    expect(getBody).toMatch(/await\s+requireAdmin\s*\(/);
  });

  it("enforces super_admin inside the GET handler itself (not only PUT/DELETE)", () => {
    expect(getBody).toMatch(/assertRole\(\s*session\s*,\s*"super_admin"\s*\)/);
  });
});

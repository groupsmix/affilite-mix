/**
 * S11 hardening: admin routes must not leak raw error messages (#657, #659).
 */
import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";

const sitesRoute = fs.readFileSync(
  path.resolve(__dirname, "../app/api/admin/sites/route.ts"),
  "utf-8",
);
const permissionsRoute = fs.readFileSync(
  path.resolve(__dirname, "../app/api/admin/permissions/route.ts"),
  "utf-8",
);
const modulesRoute = fs.readFileSync(
  path.resolve(__dirname, "../app/api/admin/modules/route.ts"),
  "utf-8",
);

describe("#659: admin/sites does not leak raw error messages", () => {
  it("GET handler does not include err.message in response", () => {
    expect(sitesRoute).not.toContain("detail: err instanceof Error");
  });

  it("POST handler uses static error message on 500", () => {
    const postSection = sitesRoute.split("export async function POST")[1];
    expect(postSection).not.toMatch(/\{ error: message \}/);
  });

  it("PATCH handler uses static error message on 500", () => {
    const patchSection = sitesRoute.split("export async function PATCH")[1];
    expect(patchSection).not.toMatch(/\{ error: message \}/);
  });

  it("DELETE handler uses static error message on 500", () => {
    const deleteSection = sitesRoute.split("export async function DELETE")[1];
    expect(deleteSection).not.toMatch(/\{ error: message \}/);
  });
});

describe("#657: admin/permissions does not echo user input in errors", () => {
  it("does not echo role_name in 404 response", () => {
    expect(permissionsRoute).not.toContain("Role not found: ${role_name}");
  });

  it("GET handler uses static error message", () => {
    expect(permissionsRoute).toContain('"Failed to list permissions"');
  });

  it("POST handler uses static error message", () => {
    expect(permissionsRoute).toContain('"Failed to assign role"');
  });

  it("DELETE handler uses static error message", () => {
    expect(permissionsRoute).toContain('"Failed to remove role"');
  });
});

describe("#657: admin/modules does not echo user input in errors", () => {
  it("does not echo module_key in validation error", () => {
    expect(modulesRoute).not.toContain("Invalid module_key: ${module_key}");
  });

  it("GET handler uses static error message", () => {
    expect(modulesRoute).toContain('"Failed to list modules"');
  });

  it("POST handler uses static error message", () => {
    expect(modulesRoute).toContain('"Failed to upsert module"');
  });

  it("PATCH handler uses static error message", () => {
    expect(modulesRoute).toContain('"Failed to bulk upsert modules"');
  });
});

#!/usr/bin/env tsx
/**
 * OF-18: Separation of Duties (SoD) enforcement tool.
 *
 * Reads config/rbac/roles.json and validates that no single role can
 * perform both a "privileged write" and an "approval" action on the same
 * resource.  Exits non-zero if any SoD violation is found, so it can be
 * wired into CI.
 *
 * Usage:
 *   tsx tools/sod-check.ts                   # check all roles
 *   tsx tools/sod-check.ts --role super_admin # check one role
 *
 * Add to CI:
 *   - name: SoD check
 *     run: pnpm exec tsx tools/sod-check.ts
 */

import * as fs from "fs";
import * as path from "path";

interface Permission {
  resource: string;
  actions: string[];
}

interface Role {
  id: string;
  display_name: string;
  permissions: Permission[];
  inherits?: string[];
}

interface RbacConfig {
  roles: Role[];
  sod_forbidden_pairs: Array<{ write_action: string; approval_action: string }>;
}

const CONFIG_PATH = path.join(process.cwd(), "config/rbac/roles.json");

function resolvePermissions(roleId: string, roles: Role[], visited = new Set<string>()): Permission[] {
  if (visited.has(roleId)) return [];
  visited.add(roleId);
  const role = roles.find((r) => r.id === roleId);
  if (!role) return [];
  const inherited: Permission[] = (role.inherits ?? []).flatMap((parentId) =>
    resolvePermissions(parentId, roles, visited),
  );
  return [...inherited, ...role.permissions];
}

function checkSoD(config: RbacConfig, targetRole?: string): boolean {
  const { roles, sod_forbidden_pairs } = config;
  let foundViolation = false;

  for (const role of roles) {
    if (targetRole && role.id !== targetRole) continue;
    const perms = resolvePermissions(role.id, roles);

    for (const { write_action, approval_action } of sod_forbidden_pairs) {
      const canWrite = perms.some((p) => p.actions.includes(write_action));
      const canApprove = perms.some((p) => p.actions.includes(approval_action));

      if (canWrite && canApprove) {
        console.error(
          `[SoD VIOLATION] Role "${role.id}" has both "${write_action}" and "${approval_action}" — forbidden pair.`,
        );
        foundViolation = true;
      }
    }
  }

  if (!foundViolation) {
    console.log("[SoD] No violations found.");
  }

  return !foundViolation;
}

const args = process.argv.slice(2);
const roleArgIdx = args.indexOf("--role");
const targetRole = roleArgIdx >= 0 ? args[roleArgIdx + 1] : undefined;

if (!fs.existsSync(CONFIG_PATH)) {
  console.error(`[SoD] Config not found: ${CONFIG_PATH}`);
  process.exit(1);
}

const config: RbacConfig = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf-8"));
const ok = checkSoD(config, targetRole);
process.exit(ok ? 0 : 1);

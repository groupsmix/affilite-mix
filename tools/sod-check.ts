#!/usr/bin/env tsx
/**
 * OF-20: Separation of Duties enforcement tool.
 *
 * Reads config/rbac/roles.json and verifies that no role definition
 * violates the declared SOD constraints. Run in CI to catch accidental
 * permission escalations.
 *
 * Usage: npx tsx tools/sod-check.ts
 * Exit code: 0 = all constraints satisfied, 1 = violations found
 */

import { readFileSync } from "fs";
import { resolve } from "path";

interface RoleConfig {
  roles: Record<string, { allow: string[]; deny: string[] }>;
  sod_constraints: Array<{
    description: string;
    role: string;
    forbidden_with: string[];
  }>;
}

function permissionMatches(permission: string, pattern: string): boolean {
  if (pattern === "*") return true;
  if (pattern.endsWith(".*")) {
    const prefix = pattern.slice(0, -2);
    return permission === prefix || permission.startsWith(prefix + ".");
  }
  return permission === pattern;
}

function roleHasPermission(
  allow: string[],
  permission: string,
): boolean {
  return allow.some((p) => permissionMatches(permission, p));
}

function main(): void {
  const configPath = resolve(process.cwd(), "config/rbac/roles.json");
  const config: RoleConfig = JSON.parse(readFileSync(configPath, "utf-8"));

  const violations: string[] = [];

  for (const constraint of config.sod_constraints) {
    const role = config.roles[constraint.role];
    if (!role) {
      violations.push(
        `[MISSING ROLE] Constraint references unknown role: ${constraint.role}`,
      );
      continue;
    }

    for (const forbidden of constraint.forbidden_with) {
      if (roleHasPermission(role.allow, forbidden)) {
        violations.push(
          `[SOD VIOLATION] Role "${constraint.role}" has forbidden permission "${forbidden}" — ${constraint.description}`,
        );
      }

      if (roleHasPermission(role.deny, forbidden)) {
        // deny list correctly blocks it — this is fine
      }
    }
  }

  if (violations.length > 0) {
    console.error("\n❌ Separation of Duties violations found:\n");
    for (const v of violations) {
      console.error(`  ${v}`);
    }
    console.error(
      `\n${violations.length} violation(s) detected. Fix config/rbac/roles.json before merging.\n`,
    );
    process.exit(1);
  } else {
    console.log("✅ All SOD constraints satisfied.");
    process.exit(0);
  }
}

main();

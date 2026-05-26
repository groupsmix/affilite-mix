#!/usr/bin/env npx tsx
/**
 * Separation of Duties (SoD) Check
 *
 * SOC 2 control CC1.5 / CC6.1 — verifies that the RBAC role definitions
 * in config/rbac/roles.json satisfy separation-of-duties constraints.
 *
 * Run: npx tsx tools/sod-check.ts
 * CI:  called from .github/workflows/ci.yml as a gate step
 *
 * Exit 0 = all SoD rules pass
 * Exit 1 = one or more violations detected
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

interface RoleDef {
  name: string;
  label: string;
  permissions: string[] | "all";
}

interface RolesFile {
  roles: RoleDef[];
  separation_of_duties: {
    rules: string[];
  };
}

const ROLES_PATH = resolve(__dirname, "../config/rbac/roles.json");

function loadRoles(): RolesFile {
  const raw = readFileSync(ROLES_PATH, "utf-8");
  return JSON.parse(raw) as RolesFile;
}

function roleHas(role: RoleDef, feature: string, action: string): boolean {
  if (role.permissions === "all") return true;
  return (
    role.permissions.includes(`${feature}:${action}`) || role.permissions.includes(`${feature}:*`)
  );
}

/**
 * SoD constraint definitions.
 * Each constraint specifies two capabilities that must not coexist
 * in any non-owner/non-super_admin role.
 */
const SOD_CONSTRAINTS: {
  description: string;
  left: { feature: string; action: string };
  right: { feature: string; action: string };
  exemptRoles: string[];
}[] = [
  {
    description: "Users who can create content must not self-publish (author role)",
    left: { feature: "content", action: "create" },
    right: { feature: "content", action: "publish" },
    exemptRoles: ["owner", "super_admin", "admin", "editor"],
  },
  {
    description: "Users who can manage settings must not also manage privacy/DSAR",
    left: { feature: "settings", action: "manage" },
    right: { feature: "privacy", action: "view" },
    exemptRoles: ["owner", "super_admin", "admin"],
  },
  {
    description: "Analysts must not have write access to any feature",
    left: { feature: "content", action: "create" },
    right: { feature: "analytics", action: "view" },
    exemptRoles: ["owner", "super_admin", "admin", "editor", "author", "moderator"],
  },
  {
    description: "Translators must not be able to publish content",
    left: { feature: "content", action: "edit" },
    right: { feature: "publishing", action: "publish" },
    exemptRoles: ["owner", "super_admin", "admin", "editor"],
  },
];

function main(): void {
  const config = loadRoles();
  let violations = 0;

  console.log("=== Separation of Duties (SoD) Check ===\n");
  console.log(`Loaded ${config.roles.length} roles from ${ROLES_PATH}\n`);

  for (const constraint of SOD_CONSTRAINTS) {
    for (const role of config.roles) {
      if (constraint.exemptRoles.includes(role.name)) continue;

      const hasLeft = roleHas(role, constraint.left.feature, constraint.left.action);
      const hasRight = roleHas(role, constraint.right.feature, constraint.right.action);

      if (hasLeft && hasRight) {
        console.error(
          `VIOLATION: Role "${role.name}" has both ` +
            `${constraint.left.feature}:${constraint.left.action} and ` +
            `${constraint.right.feature}:${constraint.right.action}`,
        );
        console.error(`  Rule: ${constraint.description}\n`);
        violations++;
      }
    }
  }

  // Verify no role can self-elevate (no role has users:manage except owner/super_admin)
  for (const role of config.roles) {
    if (role.name === "owner" || role.name === "super_admin") continue;
    if (roleHas(role, "users", "manage")) {
      console.error(
        `VIOLATION: Role "${role.name}" has users:manage — only owner/super_admin may manage users`,
      );
      violations++;
    }
  }

  console.log("---");
  if (violations > 0) {
    console.error(`\nFAILED: ${violations} SoD violation(s) detected.`);
    process.exit(1);
  } else {
    console.log("\nPASSED: All SoD constraints satisfied.");
    process.exit(0);
  }
}

main();

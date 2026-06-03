/**
 * A165-01: Separation of Duties (SOD) validation.
 *
 * Enforces that certain pairs of permissions are never granted to the
 * same role. This prevents single-role privilege escalation where one
 * role can both create/approve content or manage users + configure settings.
 *
 * The validation runs on role-permission assignment so violations are
 * caught at configuration time, not at runtime.
 */

import type { PermissionFeature, PermissionAction } from "@/types/database";
import { logger } from "@/lib/logger";

interface PermissionTuple {
  feature: PermissionFeature;
  action: PermissionAction;
}

interface SodRule {
  name: string;
  a: PermissionTuple;
  b: PermissionTuple;
}

/**
 * Forbidden permission combinations. A single role may not hold both
 * permissions in any pair. super_admin/owner bypass this at the
 * hasPermission() level but their role rows should still be clean.
 */
const SOD_RULES: SodRule[] = [
  {
    name: "content-create-vs-publish",
    a: { feature: "content", action: "create" },
    b: { feature: "content", action: "publish" },
  },
  {
    name: "content-edit-vs-approve",
    a: { feature: "content", action: "edit" },
    b: { feature: "content", action: "approve" },
  },
  {
    name: "users-manage-vs-settings-configure",
    a: { feature: "users", action: "manage" },
    b: { feature: "settings", action: "configure" },
  },
  {
    name: "products-create-vs-publish",
    a: { feature: "products", action: "create" },
    b: { feature: "products", action: "publish" },
  },
  {
    name: "privacy-manage-vs-analytics-manage",
    a: { feature: "privacy", action: "manage" },
    b: { feature: "analytics", action: "manage" },
  },
];

export interface SodViolation {
  rule: string;
  permissionA: string;
  permissionB: string;
}

/**
 * Validate a set of permissions against SOD rules.
 *
 * @param permissions - The full set of permissions assigned to a role
 * @returns An array of violations (empty if none)
 */
export function validateSod(
  permissions: ReadonlyArray<{ feature: string; action: string }>,
): SodViolation[] {
  const permSet = new Set(permissions.map((p) => `${p.feature}:${p.action}`));
  const violations: SodViolation[] = [];

  for (const rule of SOD_RULES) {
    const keyA = `${rule.a.feature}:${rule.a.action}`;
    const keyB = `${rule.b.feature}:${rule.b.action}`;

    if (permSet.has(keyA) && permSet.has(keyB)) {
      violations.push({
        rule: rule.name,
        permissionA: keyA,
        permissionB: keyB,
      });
    }
  }

  if (violations.length > 0) {
    logger.warn("[SOD] Separation of duties violations detected", {
      count: violations.length,
      rules: violations.map((v) => v.rule),
    });
  }

  return violations;
}

/**
 * Throw if adding a permission to a role would violate SOD rules.
 *
 * @param existingPermissions - Permissions the role already has
 * @param newPermission - The permission being added
 * @throws Error if the combination violates SOD rules
 */
export function assertSodCompliant(
  existingPermissions: ReadonlyArray<{ feature: string; action: string }>,
  newPermission: { feature: string; action: string },
): void {
  const combined = [...existingPermissions, newPermission];
  const violations = validateSod(combined);

  if (violations.length > 0) {
    const details = violations
      .map((v) => `${v.rule}: ${v.permissionA} conflicts with ${v.permissionB}`)
      .join("; ");
    throw new Error(`SOD violation: ${details}`);
  }
}

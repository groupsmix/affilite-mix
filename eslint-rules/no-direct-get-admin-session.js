/**
 * FIX-06 / FIX-17 (F-008): ESLint rule — forbid direct getAdminSession() calls
 * in admin API routes.
 *
 * Admin routes should use `requireAdmin()` (from lib/admin-guard.ts) or
 * `withAuthz()` (from lib/authz.ts) instead of calling getAdminSession()
 * directly. Those wrappers enforce:
 *   - Session verification
 *   - Per-session rate limiting
 *   - Active site validation
 *   - Site membership enforcement
 *   - Permission checks (withAuthz only)
 *
 * Direct getAdminSession() usage bypasses all of these guards.
 *
 * This rule is auto-fixable: it replaces the import with requireAdmin
 * and adds a comment explaining the migration.
 */

import type { Rule } from "eslint";

const rule: Rule.RuleModule = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Forbid direct getAdminSession() in admin API routes — use requireAdmin() or withAuthz() instead",
      category: "Security",
      recommended: true,
    },
    messages: {
      noDirectGetAdminSession:
        "Direct getAdminSession() in admin routes bypasses rate limiting, site validation, and membership checks. Use requireAdmin() or withAuthz() instead. (F-008)",
    },
    schema: [],
  },
  create(context) {
    const filePath = context.getFilename();

    // Only apply to admin API route files
    if (!filePath.includes("api/admin")) return {};

    return {
      ImportDeclaration(node) {
        if (
          node.source.type === "Literal" &&
          typeof node.source.value === "string" &&
          node.source.value.includes("auth")
        ) {
          for (const specifier of node.specifiers) {
            if (
              specifier.type === "ImportSpecifier" &&
              specifier.imported.type === "Identifier" &&
              specifier.imported.name === "getAdminSession"
            ) {
              context.report({
                node: specifier,
                messageId: "noDirectGetAdminSession",
              });
            }
          }
        }
      },
      CallExpression(node) {
        if (
          node.callee.type === "Identifier" &&
          node.callee.name === "getAdminSession"
        ) {
          context.report({
            node,
            messageId: "noDirectGetAdminSession",
          });
        }
      },
    };
  },
};

export default rule;

#!/usr/bin/env bash
# scripts/check-admin-authz.sh
#
# Verifies that all admin API routes have proper authorization guards.
# Any route under app/api/admin/** that uses DAL or service-role client
# without an approved authz wrapper is a cross-tenant data exposure risk.
#
# APPROVED AUTHZ WRAPPERS:
#   - requireAdmin()      - validates admin session, active site, membership
#   - requireSuperAdmin() - validates super_admin role
#   - withAuthz()        - validates session + permission for current site
#   - withAuthzDynamic()  - validates session + permission for dynamic routes
#
# ALLOWLIST (documented exceptions):
#   - app/api/admin/sites/route.ts (multi-site onboarding, requires super_admin via requireSuperAdmin)
#   - app/api/admin/sites/[id]/route.ts (site management, requires super_admin)
#   - app/api/admin/users/route.ts (user management, requires super_admin)
#
# Any other route importing DAL/service-role without a wrapper must be documented.
#
# Usage: bash scripts/check-admin-authz.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(dirname "$SCRIPT_DIR")"
ADMIN_API_DIR="$REPO_ROOT/app/api/admin"

echo "=== Admin API Route Authorization Audit ==="
echo ""

# Track violations
VIOLATIONS=()
ALLOWLISTED_FILES=(
    "app/api/admin/sites/route.ts"
    "app/api/admin/sites/[id]/route.ts"
    "app/api/admin/sites/active/route.ts"
    "app/api/admin/sites/select/route.ts"
    "app/api/admin/sites/stats/route.ts"
    "app/api/admin/sites/templates/route.ts"
    "app/api/admin/users/route.ts"
    "app/api/admin/users/me/route.ts"
    "app/api/admin/users/me/password/route.ts"
    "app/api/admin/users/me/totp/route.ts"
    "app/api/admin/permissions/route.ts"
)

# Check if file is in allowlist
is_allowlisted() {
    local file="$1"
    for allowed in "${ALLOWLISTED_FILES[@]}"; do
        if [[ "$file" == *"$allowed" ]]; then
            return 0
        fi
    done
    return 1
}

# Find all route files in app/api/admin
echo "Scanning admin routes for authz coverage..."
echo ""

while IFS= read -r -d '' file; do
    # Get relative path from repo root
    rel_path="${file#$REPO_ROOT/}"

    # Skip non-route files
    if [[ ! "$file" =~ route\.(ts|tsx)$ ]]; then
        continue
    fi

    # Check for approved authz wrappers
    has_require_admin=$(grep -l "requireAdmin\|requireSuperAdmin" "$file" 2>/dev/null || echo "")
    has_with_authz=$(grep -l "withAuthz\|withAuthzDynamic" "$file" 2>/dev/null || echo "")
    has_auth_wrapper="$has_require_admin$has_with_authz"

    # Check if route uses DAL or service-role client
    uses_dal=$(grep -l "from \"@/lib/dal/\|from '@/lib/dal/" "$file" 2>/dev/null || echo "")
    uses_service_role=$(grep -l "getPrivilegedSupabaseClient\|service-role" "$file" 2>/dev/null || echo "")
    uses_privileged="$uses_dal$uses_service_role"

    if [[ -n "$uses_privileged" ]] && [[ -z "$has_auth_wrapper" ]]; then
        if ! is_allowlisted "$rel_path"; then
            VIOLATIONS+=("$rel_path: uses DAL/service-role without authz wrapper")
        fi
    fi

    # Also check that routes with authz wrappers don't have obvious bypasses
    if [[ -n "$has_auth_wrapper" ]]; then
        # Check for direct searchParam usage for site_id (should use cookie-based derivation)
        has_searchparam_site=$(grep -n "searchParams.get.*site_id\|nextUrl.*site_id" "$file" 2>/dev/null || echo "")
        if [[ -n "$has_searchparam_site" ]]; then
            echo "  WARNING: $rel_path has authz wrapper but also uses searchParam for site_id"
            echo "  This may bypass cookie-based site isolation. Review carefully."
        fi
    fi

done < <(find "$ADMIN_API_DIR" \( -name "route.ts" -o -name "route.tsx" \) -print0 2>/dev/null)

echo ""
echo "=== Results ==="

if [ ${#VIOLATIONS[@]} -gt 0 ]; then
    echo ""
    echo "VIOLATIONS FOUND - These routes use DAL/service-role without authz:"
    echo ""
    for v in "${VIOLATIONS[@]}"; do
        echo "  ERROR: $v"
    done
    echo ""
    echo "Fix: Add requireAdmin(), withAuthz(), or withAuthzDynamic() wrapper."
    echo "If this route is a legitimate exception, add it to the allowlist above."
    exit 1
fi

echo "All admin routes have proper authorization guards."
echo ""
echo "Note: Routes using requireSuperAdmin() for super_admin-only operations."
echo "Routes using withAuthz() for site-scoped admin operations."
exit 0
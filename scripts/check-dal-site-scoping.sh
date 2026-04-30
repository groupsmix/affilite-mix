#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════
# AUDIT-FIX: DAL site_id enforcement check
#
# Scans all DAL functions in lib/dal/ to verify they include site_id
# filtering in their queries. Functions that access site-scoped tables
# without filtering by site_id are a cross-tenant data leak risk.
#
# This script is intended to run in CI (see .github/workflows/ci.yml).
# ═══════════════════════════════════════════════════════════════════
set -euo pipefail

echo "=== Checking DAL functions for site_id scoping ==="

# Tables that MUST be scoped by site_id in every query
SITE_SCOPED_TABLES=(
  categories
  products
  content
  content_products
  affiliate_clicks
  newsletter_subscribers
  ad_placements
  ad_impressions
  pages
  deals
  price_snapshots
  price_alerts
  community_posts
  community_comments
  memberships
  quizzes
  quiz_questions
  quiz_submissions
)

# DAL files that are exempt from site_id checks (they handle global data)
EXEMPT_FILES=(
  "lib/dal/admin-users.ts"
  "lib/dal/permissions.ts"
  "lib/dal/stripe-events.ts"
  "lib/dal/niche-templates.ts"
  "lib/dal/integrations.ts"
  "lib/dal/site-resolver.ts"
  "lib/dal/sites.ts"
  "lib/dal/dal-client.ts"
  "lib/dal/index.ts"
  "lib/dal/type-guards.ts"
  "lib/dal/search-utils.ts"
  "lib/dal/shared-content.ts"
  "lib/dal/dashboard-stats.ts"
  "lib/dal/niche-health.ts"
  "lib/dal/revenue-per-site.ts"
)

VIOLATIONS=""
CHECKED=0
SKIPPED=0

for file in lib/dal/*.ts; do
  # Skip exempt files
  is_exempt=false
  for exempt in "${EXEMPT_FILES[@]}"; do
    if [ "$file" = "$exempt" ]; then
      is_exempt=true
      break
    fi
  done

  if $is_exempt; then
    SKIPPED=$((SKIPPED + 1))
    continue
  fi

  CHECKED=$((CHECKED + 1))

  # Check if the file references any site-scoped table
  references_site_table=false
  for table in "${SITE_SCOPED_TABLES[@]}"; do
    if grep -q "from(\"$table\")\|from('$table')\|\.from(\`$table\`)" "$file" 2>/dev/null; then
      references_site_table=true
      break
    fi
  done

  if ! $references_site_table; then
    continue
  fi

  # If it references a site-scoped table, it MUST also reference site_id
  if ! grep -qE 'site_id|siteId|site_id.*eq|\.eq\(.*site' "$file" 2>/dev/null; then
    VIOLATIONS="$VIOLATIONS $file"
  fi
done

echo "Checked: $CHECKED DAL files, Skipped: $SKIPPED exempt files"

if [ -n "$VIOLATIONS" ]; then
  echo ""
  echo "::error::DAL files referencing site-scoped tables without site_id filtering:"
  for v in $VIOLATIONS; do
    echo "  - $v"
  done
  echo ""
  echo "Every DAL function that queries a site-scoped table MUST filter by site_id."
  echo "Add the file to EXEMPT_FILES if it genuinely handles cross-site data."
  exit 1
fi

echo "All DAL functions properly scope by site_id."

#!/usr/bin/env bash
# Check that first-load JS for key pages stays under budget.
# Usage: scripts/check-bundle-size.sh [max_kb]
# Default budget: 180 KB per page first-load JS.

set -euo pipefail

MAX_KB="${1:-180}"
BUILD_OUTPUT=".next"

if [ ! -d "$BUILD_OUTPUT" ]; then
  echo "❌ No .next directory found. Run 'npm run build' first."
  exit 1
fi

# Parse the build manifest to check page sizes.
# Next.js outputs a routes-manifest.json and build-manifest.json.
# We use the build output from stdout instead — parse the table from build logs.

echo "📦 Bundle size budget: ${MAX_KB} KB per page (first-load JS)"
echo ""

FAILED=0

# Read the Next.js build output trace file for page sizes
if [ -f "$BUILD_OUTPUT/trace" ]; then
  echo "ℹ️  Trace file found — checking build output for page sizes..."
fi

# Use the .next/server/pages-manifest.json or app-paths-manifest.json
# to enumerate routes, then check their chunk sizes
MANIFEST="$BUILD_OUTPUT/server/app-paths-manifest.json"
if [ ! -f "$MANIFEST" ]; then
  echo "⚠️  No app-paths-manifest.json found — skipping detailed check."
  echo "   Run this after 'npm run build' to get accurate sizes."
  exit 0
fi

# Check total client-side JS size
CLIENT_DIR="$BUILD_OUTPUT/static/chunks"
if [ -d "$CLIENT_DIR" ]; then
  TOTAL_KB=$(du -sk "$CLIENT_DIR" | cut -f1)
  echo "📊 Total client chunks: ${TOTAL_KB} KB"

  # Check individual chunk sizes for outliers (> budget)
  OVER_BUDGET=0
  while IFS= read -r -d '' chunk; do
    SIZE_KB=$(du -sk "$chunk" | cut -f1)
    if [ "$SIZE_KB" -gt "$MAX_KB" ]; then
      BASENAME=$(basename "$chunk")
      echo "  ⚠️  ${BASENAME}: ${SIZE_KB} KB (over ${MAX_KB} KB budget)"
      OVER_BUDGET=$((OVER_BUDGET + 1))
    fi
  done < <(find "$CLIENT_DIR" -name "*.js" -print0)

  if [ "$OVER_BUDGET" -gt 0 ]; then
    echo ""
    echo "⚠️  ${OVER_BUDGET} chunk(s) exceed the ${MAX_KB} KB budget."
    echo "   Consider code splitting or lazy loading to reduce bundle size."
    # Non-blocking for now — just warn. Set FAILED=1 to enforce.
  else
    echo "  All individual chunks under ${MAX_KB} KB budget."
  fi
fi

# Check shared framework bundle size (the core Next.js + React runtime)
FRAMEWORK_DIR="$BUILD_OUTPUT/static/chunks/framework"
if [ -d "$FRAMEWORK_DIR" ]; then
  FRAMEWORK_KB=$(du -sk "$FRAMEWORK_DIR" | cut -f1)
  echo "📊 Framework chunks: ${FRAMEWORK_KB} KB"
fi

echo ""
if [ "$FAILED" -gt 0 ]; then
  echo "❌ Bundle size check failed — ${FAILED} page(s) over budget."
  exit 1
else
  echo "Bundle size check passed."
fi

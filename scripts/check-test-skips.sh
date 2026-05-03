#!/usr/bin/env bash
# F-A87-10: CI guard against .skip / .only in test files.
#
# Detects test files that contain `it.skip`, `describe.skip`, `test.skip`,
# or their `.only` variants. In CI, skipped tests mask coverage gaps and
# `.only` narrows the suite silently.
#
# Usage:
#   scripts/check-test-skips.sh          # exits 1 if violations found
#   ALLOW_SKIP=1 scripts/check-test-skips.sh  # warn-only mode
#
# The `forbidOnly` setting in playwright.config.ts and vitest already catch
# `.only` at runtime, but this script catches `.skip` which those don't flag.

set -euo pipefail

DIRS="__tests__ e2e"
PATTERNS='\.skip\(|\.only\('
EXIT_CODE=0

echo "F-A87-10: Scanning test files for .skip() / .only() calls..."

for dir in $DIRS; do
  if [ ! -d "$dir" ]; then
    continue
  fi

  # Find .skip / .only calls in test files, excluding comments
  MATCHES=$(grep -rn --include='*.test.ts' --include='*.test.tsx' --include='*.spec.ts' --include='*.spec.tsx' \
    -E "$PATTERNS" "$dir" 2>/dev/null | grep -v '^\s*//' || true)

  if [ -n "$MATCHES" ]; then
    echo ""
    echo "WARNING: Found .skip() or .only() calls in $dir:"
    echo "$MATCHES"
    EXIT_CODE=1
  fi
done

if [ "$EXIT_CODE" -eq 0 ]; then
  echo "OK: No .skip() or .only() calls found in test files."
else
  echo ""
  echo "Found .skip() or .only() calls in test files."
  echo "Each skipped test should have a tracking issue. Remove .skip/.only"
  echo "before merging to main, or document the reason in a comment."
  if [ "${ALLOW_SKIP:-0}" = "1" ]; then
    echo "(ALLOW_SKIP=1 set -- exiting with 0)"
    exit 0
  fi
  exit 1
fi

#!/usr/bin/env bash
set -euo pipefail

# A89: Fail builds if HACK or FIXME are used without an issue URL.
# We search for FIXME or HACK that is NOT immediately followed by a URL or issue tracker ID.
echo "Scanning for unchecked HACK/FIXME comments..."

VIOLATIONS=""
# Find all TS/TSX files
FILES=$(find app lib workers -name '*.ts' -o -name '*.tsx' 2>/dev/null || true)

if [ -z "$FILES" ]; then
  echo "No source files found."
  exit 0
fi

for file in $FILES; do
  # Search for FIXME or HACK
  if grep -nE 'FIXME|HACK' "$file" >/dev/null 2>&1; then
    # Check if the line has a URL (http) or issue ID (#123)
    # If it doesn't, it's a violation.
    UNCHECKED=$(grep -HnE 'FIXME|HACK' "$file" | grep -vE 'https?://|#[0-9]+' || true)
    if [ -n "$UNCHECKED" ]; then
      if [ -z "$VIOLATIONS" ]; then
        VIOLATIONS="$UNCHECKED"
      else
        VIOLATIONS="$VIOLATIONS\n$UNCHECKED"
      fi
    fi
  fi
done

if [ -n "$VIOLATIONS" ]; then
  echo -e "::error::Unchecked HACK/FIXME comments found without an issue link:\n$VIOLATIONS"
  exit 1
fi

echo "No unchecked HACK/FIXME comments found."
exit 0

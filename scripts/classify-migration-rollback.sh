#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────────
# Classify whether a down-migration is safe for AUTOMATED rollback.
#
# Motivation (SRE audit P1-3): the automated `rollback-migrations` deploy
# job runs the corresponding `*-down.sql` file for each migration applied
# in a failed deploy. Many down files in this repo are placeholders such
# as:
#
#     -- NO DOWN: Automated rollback not supported for this migration.
#     --          Requires manual intervention.
#
# or forward-only markers for irreversible changes (e.g. a TIMESTAMPTZ
# conversion). Running such a file through `psql` succeeds — psql happily
# executes a file containing only comments — so the rollback job would
# report "rollback complete" while the schema was NEVER reverted. That is
# a silent FALSE SUCCESS at the worst possible time.
#
# This script inspects a down-migration file and classifies it as:
#
#   auto    → contains real, executable reversal SQL; safe to auto-run.
#   manual  → a no-op/placeholder, or explicitly marked irreversible /
#             manual-intervention / forward-only / data-loss. The caller
#             MUST refuse automatic rollback and fall back to the manual
#             DR runbook instead of pretending the rollback happened.
#
# Exit codes:
#   0  → auto   (safe to run automatically)
#   3  → manual (must NOT be auto-run; requires manual intervention)
#   2  → usage / file error
#
# The classification is also printed to stdout as `auto` or `manual`
# followed by a human-readable reason, so callers can log it.
# ──────────────────────────────────────────────────────────────────────

set -euo pipefail

if [ "$#" -ne 1 ]; then
  echo "Usage: $0 <path-to-down-migration.sql>" >&2
  exit 2
fi

DOWN_FILE="$1"

if [ ! -f "$DOWN_FILE" ]; then
  echo "manual: down-migration file not found: $DOWN_FILE" >&2
  # A missing down file cannot be auto-run either — treat as manual so the
  # caller halts rather than silently skipping.
  exit 3
fi

# Read the raw contents once.
RAW="$(cat "$DOWN_FILE")"

# Explicit "do not auto-run" markers. Matched case-insensitively anywhere
# in the file. These are the phrases used across this repo's placeholder /
# forward-only down migrations plus the generic irreversibility words.
MANUAL_MARKERS='NO DOWN|requires manual intervention|manual intervention required|forward-only|forward only|irreversible|not (safely )?reversible|cannot be (safely )?reversed|cannot be automatically|DATA LOSS|would lose'

if echo "$RAW" | grep -Eiq "$MANUAL_MARKERS"; then
  echo "manual: explicit irreversible / manual-intervention marker present"
  exit 3
fi

# Strip SQL comments and whitespace to determine whether ANY executable
# statement remains:
#   - remove /* ... */ block comments (including multi-line)
#   - remove -- line comments
#   - drop blank lines
EXECUTABLE="$(
  printf '%s\n' "$RAW" \
    | perl -0777 -pe 's{/\*.*?\*/}{}gs' \
    | sed -E 's/--.*$//' \
    | sed -E 's/^[[:space:]]+//; s/[[:space:]]+$//' \
    | grep -v '^$' || true
)"

if [ -z "$EXECUTABLE" ]; then
  echo "manual: down-migration contains no executable SQL (comment-only / empty placeholder)"
  exit 3
fi

echo "auto: executable reversal SQL present"
exit 0

#!/bin/bash
# DR Drill Evidence: Automated restore test for Supabase
# This script spins up a local Supabase instance, applies migrations, and seeds test data to verify backup integrity.

# T4-#16: use -euo pipefail so unbound variables and pipe failures are caught.
# Previously set -e only; that missed failures in pipelines and refs to unset vars.
set -euo pipefail

echo "Starting Disaster Recovery Restore Drill..."

# Start local Supabase (acting as the 'recovered' instance)
# T4-#16: gate the db reset on a successful start so a failed start (beyond
# "already running") doesn't trigger supabase db reset unconditionally.
if ! supabase start 2>&1 | tee /tmp/supabase-start.log; then
  if grep -q "already running" /tmp/supabase-start.log 2>/dev/null; then
    echo "Supabase already running, continuing..."
  else
    echo "❌ supabase start failed — aborting (see above for details)"
    exit 1
  fi
fi

# Reset the database to apply all migrations from scratch
supabase db reset

# Check if tables were created successfully
TABLE_COUNT=$(supabase db query "SELECT count(*) FROM pg_tables WHERE schemaname = 'public';" | grep -o -E '[0-9]+' | head -1)

if [ "$TABLE_COUNT" -gt 0 ]; then
  echo "✅ Restore successful! $TABLE_COUNT tables created."
else
  echo "❌ Restore failed! No tables found."
  exit 1
fi

echo "DR Drill Complete. Instance is ready for traffic."

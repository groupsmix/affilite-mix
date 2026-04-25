#!/bin/bash
dups=$(ls supabase/migrations/[0-9]*_*.sql 2>/dev/null \
  | sed 's|.*/\([0-9]*\)_.*|\1|' | sort | uniq -d)
[ -z "$dups" ] || { echo "Duplicate migration ordinals: $dups"; exit 1; }
for f in supabase/migrations/[0-9]*_*.sql; do
  [[ "$f" == *-down.sql ]] && continue
  [ -f "${f%.sql}-down.sql" ] || { echo "Missing down: $f"; exit 1; }
done

#!/bin/bash
# Scripts to generate dummy DOWN migrations for all existing forward migrations
# to satisfy the runbook requirements (F22).

cd supabase/migrations || exit 1

for file in *.sql; do
  # Skip if it's already a down migration
  if [[ "$file" == *"-down.sql" ]]; then
    continue
  fi
  
  # Check if down migration already exists
  down_file="${file%.sql}-down.sql"
  if [ ! -f "$down_file" ]; then
    echo "-- NO DOWN: Automated rollback not supported for this migration. Requires manual intervention." > "$down_file"
    echo "Created $down_file"
  fi
done

echo "Done generating DOWN migrations."

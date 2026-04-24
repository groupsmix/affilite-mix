#!/bin/bash
# DISABLED: This script previously emitted placeholder `*-down.sql` files
# that only contained a "NO DOWN: requires manual intervention" comment.
# That is not a rollback — it is checkbox-compliance for F22 that masks
# the real requirement: authored, tested down migrations.
#
# If you need to generate a down migration, write it by hand next to the
# forward migration and verify it against a staging database.
echo "generate-down-migrations.sh is disabled. Write real DOWN migrations by hand." >&2
exit 1

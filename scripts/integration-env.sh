#!/usr/bin/env bash
# Export env vars for pointing integration tests at the local
# docker-compose Supabase stack (J-1).  Source this file before running
# `npm run test:integration`:
#
#   docker compose up -d
#   source scripts/integration-env.sh
#   npm run test:integration
#
# The JWTs below are the published Supabase self-hosted dev keys that
# match `docker-compose.yml`'s `JWT_SECRET`.  They only work against the
# local stack.

export TEST_WITH_SUPABASE=1
export NEXT_PUBLIC_SUPABASE_URL="http://localhost:54321"
export NEXT_PUBLIC_SUPABASE_ANON_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlLWRlbW8iLCJpYXQiOjE2NDE3NjkyMDAsImV4cCI6MTc5OTUzNTYwMH0.dc_X5iR_VP_qT0zsiyj_I_OZ2T9FtRU2BBNWN8Bu4GE"
export SUPABASE_SERVICE_ROLE_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIiwiaXNzIjoic3VwYWJhc2UtZGVtbyIsImlhdCI6MTY0MTc2OTIwMCwiZXhwIjoxNzk5NTM1NjAwfQ.DaYlNEoUrrEn2Ig7tqibS-PHK5vgusbcbo7X36XVt4Q"
# Tests also need the usual app-side defaults to boot the server-env
# validator in `@/lib/server-env`.
export JWT_SECRET="${JWT_SECRET:-local-integration-secret-at-least-32-chars-long-for-jwt}"
export INTERNAL_API_TOKEN="${INTERNAL_API_TOKEN:-local-integration-internal-token}"
export CRON_SECRET="${CRON_SECRET:-local-integration-cron-secret}"
export NEXT_PUBLIC_DEFAULT_SITE="${NEXT_PUBLIC_DEFAULT_SITE:-ai-compared}"

echo "Integration env exported:"
echo "  TEST_WITH_SUPABASE=$TEST_WITH_SUPABASE"
echo "  NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL"
echo "  NEXT_PUBLIC_DEFAULT_SITE=$NEXT_PUBLIC_DEFAULT_SITE"

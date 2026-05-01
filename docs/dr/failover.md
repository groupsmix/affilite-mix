# DR Failover Plan (OF-33)

Primary: Cloudflare WEU. Secondary: WNAM. Failover trigger: 2 of 3 health checks
red for 5 minutes.

If the paid Cloudflare Load Balancer is unavailable, the manual fallback is:

1. Update `groupsmix.com` A/AAAA records via Terraform `dns-failover` workspace.
2. Promote staging Worker route to prod via `wrangler deploy --env=dr`.
3. Mark Supabase read replica as primary via `tools/dr/promote-replica.sh`.

RTO: 30 min. RPO: 5 min.

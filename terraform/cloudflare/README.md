# Cloudflare infrastructure (Terraform)

Terraform module that codifies the Cloudflare account/zone-level configuration
for the `affilite-mix` worker. Pinned to `cloudflare/cloudflare ~> 5.0`.

## What's in IaC

| Domain                | Resource(s)                                                                       | File         |
| --------------------- | --------------------------------------------------------------------------------- | ------------ |
| TLS / HTTPS           | `cloudflare_zone_setting.always_use_https`, `min_tls_version`                     | `main.tf`    |
| HSTS                  | `cloudflare_zone_setting.security_header` (HSTS, max-age 2y, preload, subdomains) | `main.tf`    |
| Bot protection        | `cloudflare_zone_setting.bot_fight_mode`                                          | `main.tf`    |
| Browser/JS challenge  | `cloudflare_zone_setting.browser_check`, `security_level`                         | `main.tf`    |
| WAF custom rules      | `cloudflare_ruleset.waf_custom` (`http_request_firewall_custom`)                  | `main.tf`    |
| Rate limit            | `cloudflare_ruleset.rate_limit_auth` (`http_ratelimit`)                           | `main.tf`    |
| Cache rules           | `cloudflare_ruleset.cache_rules` (`http_request_cache_settings`)                  | `main.tf`    |
| Logpush               | `cloudflare_logpush_job.worker_logs` (workers_trace_events)                       | `main.tf`    |
| Worker SLO alerts     | `cloudflare_notification_policy.worker_5xx_alert`, `worker_cpu_time_alert`        | `alerts.tf`  |
| KV namespaces         | `cloudflare_workers_kv_namespace.rate_limit_kv`, `app_cache_kv`                   | `storage.tf` |
| R2 buckets            | `cloudflare_r2_bucket.next_inc_cache`                                             | `storage.tf` |
| Queues + DLQs         | `cloudflare_queue.click_tracking`, `click_tracking_dlq`                           | `queues.tf`  |
| Worker custom domains | `cloudflare_workers_custom_domain.worker_domains[*]`                              | `dns.tf`     |
| DNS records           | `cloudflare_dns_record.records[*]` (driven by the `dns_records` map in tfvars)    | `dns.tf`     |

## What's intentionally **not** in IaC (and why)

| Resource                                  | Owner            | Reason                                                                                                        |
| ----------------------------------------- | ---------------- | ------------------------------------------------------------------------------------------------------------- |
| Worker bundle (`affilite-mix`)            | wrangler         | Built from source via `opennextjs-cloudflare deploy`. Coupled to the build artifact; TF would race the CI.    |
| Worker routes (`*.wristnerd.xyz/*`, etc.) | wrangler         | Tightly coupled to the bundle — declared in `wrangler.jsonc → routes`.                                        |
| Durable Object class bindings             | wrangler         | The class names (`DOQueueHandler`, `DOShardedTagCache`, `RateLimiterDO`) come from the Worker source code.    |
| Queue producer/consumer **bindings**      | wrangler         | The queue resources themselves are in IaC; the binding configuration ships with the Worker bundle.            |
| Worker secrets (`wrangler secret put`)    | deploy workflow  | Secrets must never enter Terraform state. Set in `.github/workflows/deploy.yml` via `wrangler secret put`.    |
| Cron triggers                             | wrangler         | Declared in `wrangler.jsonc → triggers.crons` because they invoke the Worker's `scheduled()` handler.         |
| Page Rules                                | n/a (deprecated) | Cloudflare deprecated Page Rules in favour of Rulesets. Equivalent functionality lives in the rulesets above. |

## Variables

| Variable                | Required | Default        | Source                                                            |
| ----------------------- | -------- | -------------- | ----------------------------------------------------------------- |
| `cloudflare_api_token`  | yes      | —              | Scoped token; see [docs/CLOUDFLARE.md](../../docs/CLOUDFLARE.md). |
| `cloudflare_account_id` | yes      | —              | `0dadac330461be7f3e6fce8cb6611ba4` (production).                  |
| `zone_id`               | yes      | —              | `a3fc8a7a314e9b6ab61362f7aacee29c` (`wristnerd.xyz`).             |
| `worker_service_name`   | no       | `affilite-mix` | Must match `wrangler.jsonc → name`.                               |
| `worker_environment`    | no       | `production`   | Worker environment for custom-domain bindings.                    |
| `worker_custom_domains` | no       | 3 hostnames    | Mirrors `wrangler.jsonc → routes[*].custom_domain = true`.        |
| `dns_records`           | no       | `{}`           | Map of non-Worker DNS records (MX, TXT, CAA, …).                  |
| `r2_default_location`   | no       | `WNAM`         | R2 bucket data-location hint.                                     |

## API token scopes

The token in `cloudflare_api_token` needs:

- `Zone:Edit` (zone settings, rulesets, DNS, Worker custom domains)
- `Account:Workers Scripts:Edit` (referenced by Worker custom domains)
- `Account:Workers KV Storage:Edit` (KV namespaces)
- `Account:Workers R2 Storage:Edit` (R2 buckets)
- `Account:Cloudflare Queues:Edit` (queues)
- `Account:Logs:Edit` (Logpush)
- `Account:Notifications:Edit` (notification policies)
- `Zone:Zone WAF:Edit` (WAF rulesets)

A token scoped to a single zone (`wristnerd.xyz`) plus the production account is
sufficient. Do **not** use the global API key — see
[`docs/cloudflare-recovery.md`](../../docs/cloudflare-recovery.md#api-token-vs-global-key).

## Apply

```bash
export TF_VAR_cloudflare_api_token=cf_xxx
export TF_VAR_cloudflare_account_id=0dadac330461be7f3e6fce8cb6611ba4
export TF_VAR_zone_id=a3fc8a7a314e9b6ab61362f7aacee29c

cd terraform/cloudflare
terraform init     # configure a real backend (s3/gcs/tfcloud) before this in prod
terraform plan
terraform apply
```

The state backend is intentionally left unset in `main.tf` — pick the team's
preferred backend before running `init` for real (Terraform Cloud, S3, GCS).

## Importing existing resources

If the resources already exist in the dashboard, import them rather than
applying (which would error on conflict). Each `.tf` file lists the matching
`terraform import` command in its top comment.

A scripted helper is available:

```bash
CLOUDFLARE_API_TOKEN=... ZONE_ID=... \
  ./scripts/cf-security-snapshot.sh evidence/before-import
```

This dumps the live IDs you'll need for the import addresses.

## Evidence / audit

See [`docs/cloudflare-evidence.md`](../../docs/cloudflare-evidence.md) for the
control-by-control evidence checklist (P2 #63) — every WAF/cache/rate-limit/TLS
control is listed there with its IaC source, expected value, and a verification
command.

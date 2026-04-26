# Cloudflare control evidence — P2 #63

Audit-ready inventory of every Cloudflare control surface for the
`affilite-mix` worker on the `wristnerd.xyz` zone. For each control this doc
records:

- **Expected value** — what the control should be set to in production.
- **IaC source** — the file and resource that owns the control. If a control
  is not yet in IaC, that is flagged explicitly.
- **Verification** — the API call (or path inside the snapshot bundle) that
  proves the live config matches the expected value.

Verifications use the snapshot script `scripts/cf-security-snapshot.sh`, which
dumps every relevant zone setting, ruleset, and DNS record into a directory
that can be diffed across runs. Run it before and after each change to capture
evidence:

```bash
CLOUDFLARE_API_TOKEN=<scoped-token> ZONE_ID=a3fc8a7a314e9b6ab61362f7aacee29c \
  ./scripts/cf-security-snapshot.sh evidence/$(date -u +%Y%m%d-%H%M%S)
```

Commit (or attach to the audit packet) the resulting directory.

> **Account:** `0dadac330461be7f3e6fce8cb6611ba4`
> **Zone:** `wristnerd.xyz` (`a3fc8a7a314e9b6ab61362f7aacee29c`)
> **Plan:** Free
> **Worker:** `affilite-mix`

---

## 1. TLS settings

| Control                  | Expected      | IaC source                                                                  | Snapshot file                   |
| ------------------------ | ------------- | --------------------------------------------------------------------------- | ------------------------------- |
| SSL mode                 | Full (Strict) | _Dashboard-only on Free plan; tracked in `cloudflare-production.md`_        | `ssl.json`                      |
| Always Use HTTPS         | `on`          | `terraform/cloudflare/main.tf` → `cloudflare_zone_setting.always_use_https` | `always_use_https.json`         |
| Minimum TLS version      | `1.2`         | `terraform/cloudflare/main.tf` → `cloudflare_zone_setting.min_tls_version`  | `min_tls_version.json`          |
| Opportunistic Encryption | `on`          | _Dashboard default; not currently in IaC_                                   | `opportunistic_encryption.json` |
| TLS 1.3                  | `on`          | _Dashboard default; not currently in IaC_                                   | `tls_1_3.json`                  |
| Automatic HTTPS Rewrites | `on`          | _Dashboard default; not currently in IaC_                                   | `automatic_https_rewrites.json` |

API spot-check:

```bash
curl -s -H "Authorization: Bearer $CF_API_TOKEN" \
  "https://api.cloudflare.com/client/v4/zones/$ZONE_ID/settings/min_tls_version" \
  | jq '.result.value'   # expected: "1.2"
```

## 2. HSTS

| Control              | Expected             | IaC source                                                                 |
| -------------------- | -------------------- | -------------------------------------------------------------------------- |
| HSTS enabled         | `true`               | `terraform/cloudflare/main.tf` → `cloudflare_zone_setting.security_header` |
| `max_age`            | `63072000` (2 years) | same                                                                       |
| `include_subdomains` | `true`               | same                                                                       |
| `preload`            | `true`               | same                                                                       |
| `nosniff`            | `true`               | same                                                                       |

Snapshot file: `security_header.json`.

```bash
curl -s -H "Authorization: Bearer $CF_API_TOKEN" \
  "https://api.cloudflare.com/client/v4/zones/$ZONE_ID/settings/security_header" \
  | jq '.result.value.strict_transport_security'
```

Live response header check (any production hostname):

```bash
curl -sI https://wristnerd.xyz | grep -i '^strict-transport-security'
# Expected: strict-transport-security: max-age=63072000; includeSubDomains; preload
```

## 3. Bot protection

| Control                 | Expected | IaC source                                                                |
| ----------------------- | -------- | ------------------------------------------------------------------------- |
| Bot Fight Mode          | `on`     | `terraform/cloudflare/main.tf` → `cloudflare_zone_setting.bot_fight_mode` |
| Browser Integrity Check | `on`     | `terraform/cloudflare/main.tf` → `cloudflare_zone_setting.browser_check`  |
| Security Level          | `high`   | `terraform/cloudflare/main.tf` → `cloudflare_zone_setting.security_level` |

Super Bot Fight Mode (paid Bot Management) is intentionally **not** enabled —
the zone is on the Free plan. Re-evaluate once the plan is upgraded.

## 4. WAF rules

| Control                        | Expected                                                                  | IaC source                                                       |
| ------------------------------ | ------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| Custom rule: high-risk traffic | `managed_challenge` for ASNs in {12345, 54321} or country in {KP, IR, SY} | `terraform/cloudflare/main.tf` → `cloudflare_ruleset.waf_custom` |
| Managed Ruleset (Cloudflare)   | _Free plan: not available; tracked in `cloudflare-production.md`_         | n/a                                                              |
| OWASP Core Ruleset             | _Free plan: not available_                                                | n/a                                                              |

> The placeholder ASNs `12345 / 54321` must be replaced with real offender ASNs
> from Cloudflare analytics before applying. See the inline comment in
> `main.tf`.

Snapshot file: `rulesets.json` → entry where `phase == "http_request_firewall_custom"`.

## 5. Rate limits

| Control                           | Expected                                                                              | IaC source                                                                            |
| --------------------------------- | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `/api/auth/*` rate limit          | 20 req / 60 s per `(ip.src, cf.colo.id)` — 5 min mitigation, block                    | `terraform/cloudflare/main.tf` → `cloudflare_ruleset.rate_limit_auth`                 |
| Distributed rate limiter (Worker) | Backed by `RATE_LIMITER_DO` Durable Object (preferred) and `RATE_LIMIT_KV` (fallback) | `wrangler.jsonc` (binding) + `lib/rate-limit.ts` (logic) + `storage.tf` (KV resource) |

Snapshot file: `rulesets.json` → entry where `phase == "http_ratelimit"`.

## 6. Cache rules

| Control                 | Expected                                                                                                     | IaC source                                                                    |
| ----------------------- | ------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------- |
| `/api/*` cache bypass   | `cache = false` (action `set_cache_settings`)                                                                | `terraform/cloudflare/main.tf` → `cloudflare_ruleset.cache_rules`             |
| Worker cache (R2/KV/DO) | OpenNext incremental cache via `NEXT_INC_CACHE_R2_BUCKET`, sharded tag cache via `NEXT_TAG_CACHE_DO_SHARDED` | `terraform/cloudflare/storage.tf` (R2 bucket) + `wrangler.jsonc` (DO binding) |

See `docs/CACHE-TOPOLOGY.md` for the per-route cache strategy and
`docs/rendering-cache-policy.md` for the render-time rules.

Snapshot file: `rulesets.json` → entry where `phase == "http_request_cache_settings"`.

## 7. Page Rules

**Status:** None. Page Rules are deprecated by Cloudflare in favour of
Rulesets. Equivalent functionality lives in the rulesets in §4–6.

If any legacy page rules still exist on the zone, the snapshot script captures
them in `page_rules.json` (empty result is the expected steady state).

## 8. Custom domains

| Hostname                    | Expected                                    | IaC source                                                                                         |
| --------------------------- | ------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `wristnerd.xyz`             | Bound to Worker `affilite-mix` (production) | `terraform/cloudflare/dns.tf` → `cloudflare_workers_custom_domain.worker_domains["wristnerd.xyz"]` |
| `arabictools.wristnerd.xyz` | Same                                        | `cloudflare_workers_custom_domain.worker_domains["arabictools.wristnerd.xyz"]`                     |
| `crypto.wristnerd.xyz`      | Same                                        | `cloudflare_workers_custom_domain.worker_domains["crypto.wristnerd.xyz"]`                          |

The `routes[*].pattern` entries with `custom_domain = true` in `wrangler.jsonc`
must stay in sync with the `worker_custom_domains` variable. Drift between the
two is considered a finding.

API verification:

```bash
curl -s -H "Authorization: Bearer $CF_API_TOKEN" \
  "https://api.cloudflare.com/client/v4/accounts/$CF_ACCOUNT_ID/workers/domains" \
  | jq '.result[] | select(.service == "affilite-mix") | .hostname'
```

## 9. DNS records

Non-Worker DNS records (MX, TXT for SPF/DKIM/DMARC, CAA, verification records
for third-party services) are managed via the `dns_records` map in
`terraform/cloudflare/dns.tf`. Worker-served hostnames must NOT be listed there
— Cloudflare auto-provisions their internal DNS entry when the Worker custom
domain is created.

Snapshot file: `dns.json`. Diff against this file after each change to detect
unmanaged drift.

## 10. Origin protection

> The "origin" for this app is the Worker isolate itself. There is no separate
> origin server. Origin protection therefore reduces to: "make sure no traffic
> reaches Cloudflare-bypassing endpoints."

| Control                              | Expected                                                                                                   | Source                                                                                                         |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Worker IS the origin                 | All routes terminate in `affilite-mix` worker — no separate origin host                                    | `wrangler.jsonc → routes`, `terraform/cloudflare/dns.tf`                                                       |
| No A/AAAA pointing at exposed origin | All A/AAAA records are proxied (orange cloud) or are owned by the Worker custom domain                     | `cloudflare_dns_record.records[*].proxied = true` (enforced by code review) + snapshot diff against `dns.json` |
| Authenticated Origin Pulls (mTLS)    | n/a (no separate origin)                                                                                   | —                                                                                                              |
| Cloudflare Tunnel                    | n/a (no separate origin)                                                                                   | —                                                                                                              |
| Internal API token                   | `INTERNAL_API_TOKEN` enforces middleware ↔ resolve-site auth so only the worker can call its own internals | `lib/internal-auth.ts`, `middleware.ts`                                                                        |

If a non-Worker origin is ever introduced, this section must grow to include:

- `cloudflare_authenticated_origin_pulls` (mTLS to the origin),
- IP allowlist on the origin (Cloudflare IP ranges only, refreshed automatically), or
- `cloudflare_tunnel_*` resources for outbound-only origin connectivity.

---

## Evidence packet structure

Running `./scripts/cf-security-snapshot.sh evidence/<timestamp>` produces the
directory layout consumed by this checklist:

```
evidence/<timestamp>/
├── always_use_https.json
├── min_tls_version.json
├── ssl.json
├── security_header.json          # HSTS payload
├── bot_fight_mode.json
├── browser_check.json
├── security_level.json
├── automatic_https_rewrites.json
├── opportunistic_encryption.json
├── tls_1_3.json
├── dns.json                      # all zone DNS records
├── rulesets.json                 # WAF + rate limit + cache phase entrypoints
├── page_rules.json               # legacy; expected to be empty
└── rate_limits.json              # legacy v1 endpoint; superseded by rulesets
```

To produce the full audit packet:

1. Run the snapshot script.
2. Export the Terraform plan against the live state:
   ```bash
   cd terraform/cloudflare
   terraform plan -no-color > ../../evidence/<timestamp>/terraform-plan.txt
   ```
   An empty plan ("No changes") is the expected steady state and is itself
   evidence that the live config matches IaC.
3. Capture the Worker custom domain list:
   ```bash
   curl -s -H "Authorization: Bearer $CF_API_TOKEN" \
     "https://api.cloudflare.com/client/v4/accounts/$CF_ACCOUNT_ID/workers/domains" \
     | jq '.' > evidence/<timestamp>/worker_custom_domains.json
   ```
4. Capture the KV/R2/Queue inventory:
   ```bash
   npx wrangler kv namespace list > evidence/<timestamp>/wrangler-kv.txt
   npx wrangler r2 bucket list   > evidence/<timestamp>/wrangler-r2.txt
   npx wrangler queues list      > evidence/<timestamp>/wrangler-queues.txt
   ```
5. Commit the directory or attach to the audit packet.

## Cross-references

- [`terraform/cloudflare/README.md`](../terraform/cloudflare/README.md) — IaC
  coverage matrix and import instructions (P2 #64).
- [`docs/CLOUDFLARE.md`](./CLOUDFLARE.md) — single source of truth for
  bindings, secrets, and cron triggers.
- [`docs/cloudflare-production.md`](./cloudflare-production.md) — dashboard
  steps and verification scripts per setting.
- [`docs/cloudflare-recovery.md`](./cloudflare-recovery.md) — account recovery
  and full rebuild playbook.
- [`docs/cloudflare-audit-remediation.md`](./cloudflare-audit-remediation.md) —
  prior audit findings and their remediation status.

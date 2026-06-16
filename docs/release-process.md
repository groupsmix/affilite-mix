# Release Process

Audit items #88, #93.

## Cadence

- `main` is always deployable. Cloudflare Pages builds every push to
  `main` and hot-deploys.
- Tag releases follow `vYYYY.MM.DD-<n>` (e.g. `v2024.06.04-1`). Tags
  are cut from green CI on `main` and reference a single curated
  CHANGELOG entry.
- Hotfix branches use `hotfix/<short-slug>` and merge directly to
  `main` after a single reviewer + green CI; they are tagged
  `vYYYY.MM.DD-h<n>`.

## CHANGELOG

`CHANGELOG.md` follows [Keep a Changelog](https://keepachangelog.com/).
Every PR that lands user-visible behaviour, security changes, or
breaking schema changes appends an entry under the `Unreleased`
section. The release script promotes `Unreleased` to a dated section
when the tag is cut.

## Pre-deploy Gates

CI must show:

1. `npm run lint` — clean.
2. `npm run typecheck:all` — clean across `tsconfig.json` and the
   Worker tsconfig.
3. `npm test` — all suites green, including:
   - `cross-tenant-authz`
   - `cron-registry`
   - `migration-order`
   - `csrf`
   - `ssrf-guard`
   - `pagination`
   - `upload-validation`
4. `npm run build` (or the Cloudflare equivalent) — no Next.js or
   `opennextjs-cloudflare` errors.

## Deploy

```bash
# Cut the release tag.
git switch main && git pull --ff-only
npm run release            # bumps CHANGELOG, writes the tag, pushes

# Cloudflare Pages deploys main automatically; verify in the dashboard.
# For Workers (the cron dispatcher) deploy with:
npx wrangler deploy
```

## Post-deploy Smoke

Run `npm run smoke` (defined in `package.json`) which hits:

- `GET /api/health` — expect `{ status: "ok" }`.
- `GET /api/cron/health` — expect 200 (no auth, returns last run
  timestamps for every job in `lib/cron-registry.ts`).
- `POST /api/admin/upload` with an oversized fake body — expect 400.
- `GET /sitemap.xml` — expect non-empty response with the canonical
  domain.

## Rollback

| Surface             | Steps                                                                                                                 |
| ------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Cloudflare Pages    | Pages → Deployments → previous successful → "Promote to production".                                                  |
| Cloudflare Workers  | `npx wrangler rollback`.                                                                                              |
| Supabase migrations | Run the matching `*-down.sql` from `supabase/migrations-down/`. See `supabase/migrations/README.md` for the playbook. |
| Cloudflare KV / R2  | Restore from snapshot per `docs/BACKUP-POLICY.md`.                                                                    |

## Coordination

The release captain pings `#release-train` 15 min before any production
push and confirms the on-call has acknowledged. For schema-changing
releases the on-call must explicitly approve in the PR.

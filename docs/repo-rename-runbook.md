# Repo Rename Runbook: `affilite-mix` → `affiliate-mix`

**Status:** deferred — owner decision (audit item #27; PR #791 explicitly declared
the rename out of scope).
**Urgency:** none. Purely cosmetic. Do **not** execute mid-launch; batch with a
maintenance window.
**Owner:** repo admin.

This document exists so the rename, when it happens, is a checklist instead of an
incident. GitHub auto-redirects old web and git URLs after a rename, but the
redirects are best-effort: anything that hardcodes the old name (CI, deploy
bindings, scripts) can break silently.

---

## Preconditions

- [ ] Maintenance window agreed; no deploys in flight.
- [ ] Cloudflare dashboard access (the Pages project that builds this repo
      references it **by name**, so its source binding must be updated).
- [ ] List of external links to update (badges, status pages, customer-facing
      docs) prepared in advance.

## Steps

1. **Freeze deploys.** Pick a quiet window; pause any scheduled CI that deploys.
2. **Rename on GitHub.** Settings → General → rename `affilite-mix` →
   `affiliate-mix`. Old URLs start redirecting immediately.
3. **Update the Cloudflare Pages source binding.** The Pages project tracks this
   repo by name; repoint it at `groupsmix/affiliate-mix` and trigger a build to
   confirm it succeeds.
4. **Update the Supabase GitHub integration**, if connected.
5. **Update local clones** (every dev machine):

   ```sh
   git remote set-url origin git@github.com:groupsmix/affiliate-mix.git
   ```

6. **Sweep repo-URL references** (these are the only true repo-name references;
   see "Leave unchanged" below before editing anything else):
   - `scripts/github-rulesets-snapshot.sh` — `REPO` default and usage comment
     (already env-overridable via `REPO=`).
   - Badges and clone URLs in `README.md` and `docs/`.
7. **Verify.**
   - Fresh `git clone` from the new URL succeeds.
   - A production deploy completes and the Pages build is green.
   - `REPO=affiliate-mix scripts/github-rulesets-snapshot.sh` runs clean.
8. **Update external links** (status pages, customer-facing docs, bookmarks).

## Leave unchanged — same string, NOT repo references

These contain the literal `affilite-mix` but identify infrastructure or tokens,
not the repository. Renaming them is out of scope and actively harmful here:

| Reference                                                            | Why it must not change with the repo rename                                                             |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Cloudflare Worker names (`affilite-mix`, `affilite-mix-heavy-crons`) | Infra identifiers; renaming workers is a separate migration with its own secrets/cron/DNS blast radius. |
| JWT `aud`/`iss` (`affilite-mix-admin`, `affilite-mix-auth`)          | Changing these invalidates every outstanding session and signed token.                                  |
| `docker-compose.yml` project and label names                         | Local-dev only; no production impact, no need to churn them.                                            |

## Rollback

A GitHub rename is reversible: rename back to `affilite-mix` and the redirects
flip direction. Re-point the Cloudflare Pages binding back if it was already
updated.

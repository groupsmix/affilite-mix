# Admin API machine access

> **Authoritative integration guide:** [Automation API integration guide](./automation-api.md).
> Use the scoped `/api/automation/v1` service-account API for AI mutations.
> This page retains the legacy full-admin bearer-token details only.

`/api/admin/*` accepts two credentials:

| Caller              | Credential                                | CSRF                         |
| ------------------- | ----------------------------------------- | ---------------------------- |
| Dashboard (browser) | `__Host-nh_admin_token` session cookie    | double-submit token required |
| Script / AI agent   | `Authorization: Bearer <admin api token>` | not required                 |

The session cookie is bound to the client's user agent and IP prefix and expires
after 30 minutes of inactivity, so an automated client cannot hold one. Bearer
tokens remain available for compatible, non-sensitive admin routes. They are
not permitted on user, token, permission, site, automation service account,
integration, affiliate-network, privacy/GDPR, or `users/me*` routes. The
AI/automation path for mutations is the scoped `/api/automation/v1`
service-account API, not a full-admin bearer token.

When both credentials are present the cookie wins and CSRF validation still
applies, so an attacker cannot downgrade an interactive session by appending an
`Authorization` header.

## Creating a token

Signed in as a `super_admin`, from the dashboard origin:

```bash
curl -X POST https://<your-domain>/api/admin/api-tokens \
  -H 'content-type: application/json' \
  -H "x-csrf-token: $CSRF" \
  -b "__Host-nh_admin_token=$SESSION; __Host-nh_csrf=$CSRF" \
  -d '{"name":"kick-ai-bot","scope":"all","expires_in_days":90}'
```

- `scope: "all"` — every site (full admin, equivalent to a super_admin session).
- `scope: "site"` with `site_id` — the token is pinned to that one site.
- `expires_in_days` — 1 to 365.

The response contains `plain_token` **once**; only its SHA-256 hash is stored.
Store it in a secret manager. If it is lost, revoke and create a new one.

## Using a token

```bash
curl https://<your-domain>/api/admin/products \
  -H "Authorization: Bearer $ADMIN_API_TOKEN"
```

Site selection for a bearer request:

1. A site-scoped token always acts on its own site; `x-admin-site` cannot
   override it.
2. An all-sites token acts on the site named by `x-admin-site: <site-slug>`.
3. Without that header it falls back to `NEXT_PUBLIC_DEFAULT_SITE`.

```bash
curl https://<your-domain>/api/admin/products \
  -H "Authorization: Bearer $ADMIN_API_TOKEN" \
  -H 'x-admin-site: wristnerd'
```

## Controls that still apply

- Role checks: a route requiring `super_admin` needs a token created by a
  `super_admin`; the token inherits its creator's role and nothing more.
- Site membership: non-super-admin tokens only reach sites their creator
  belongs to.
- Rate limit: 600 requests/minute, bucketed per token (`admin-token:<id>`), so a
  runaway bot cannot consume a human admin's budget.
- Expiry and revocation are enforced on every request; `last_used_at` is
  updated so unused tokens are easy to spot.
- Deactivating the admin user disables all of their tokens.
- Mutations are recorded in the audit log under the creator's identity.

## Revoking

```bash
curl -X DELETE https://<your-domain>/api/admin/api-tokens/<token-id> \
  -H "Authorization: Bearer $ADMIN_API_TOKEN"
```

Revoke immediately if a token leaks (CI logs, chat transcript, agent prompt).
Rotate agent tokens on the same schedule as other secrets — see
[Secrets Rotation Runbook](./secrets-rotation-runbook.md).

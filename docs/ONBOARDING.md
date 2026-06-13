# Affilite-Mix Onboarding Tour

**Target Time**: 15 minutes to get running locally + 30 minutes for architecture overview
**Audience**: New engineers joining the project
**Last Updated**: 2026-06-11

## 0. Quick Start (15 Minutes)

### Prerequisites

- Node.js 20+ (check `.nvmrc`)
- psql (PostgreSQL client tools)
- Supabase CLI
- Cloudflare account with Workers access

### 1. Clone and Setup

```bash
# Clone the repository
git clone https://github.com/groupsmix/affilite-mix.git
cd affilite-mix

# Install dependencies
npm ci

# Copy environment template
cp .env.example .env
cp .dev.vars.example .dev.vars

# Fill in required environment variables (see .env.example)
# Critical for local dev:
# - NEXT_PUBLIC_SUPABASE_URL
# - NEXT_PUBLIC_SUPABASE_ANON_KEY
# - SUPABASE_DB_URL
# - JWT_SECRET (generate: openssl rand -hex 64)
```

### 2. Database Setup

```bash
# Install psql if not available
# Ubuntu/Debian: sudo apt-get install postgresql-client
# macOS: brew install postgresql
# Windows: Download from postgresql.org

# Run migrations against local/remote Supabase
npm run db:migrate

# Seed data for development (optional)
# See docs/CLOUDFLARE.md for Supabase setup details
```

### 3. Start Local Development

```bash
# Start Next.js dev server
npm run dev

# Start workers (separate terminals)
# Main worker: npx wrangler dev
# Heavy crons: npx wrangler dev --config wrangler.heavy-crons.jsonc
# Log shipper: cd workers/log-shipper && npx wrangler dev
```

### 4. Verify Setup

```bash
# Run tests
npm test

# Run type checking
npm run typecheck

# Run linting
npm run lint
```

## 1. Architecture Overview (30 Minutes)

### High-Level Architecture

This is a **multi-tenant affiliate platform** built on:

- **Next.js 15 (App Router)** - Frontend and API routes
- **Supabase Postgres** - Single tenant data store with RLS
- **Cloudflare Workers** - Edge computing platform (via OpenNext)
- **R2 + KV + Durable Objects** - Caching and rate limiting
- **Cloudflare Queues** - Async click tracking

### Key Architectural Decisions (ADRs)

**Critical ADRs to understand first:**

- `ADR-0001-cloudflare-workers-opennext.md` - Why Workers + OpenNext
- `ADR-0002-bcrypt-pbkdf2-transparent-upgrade.md` - Password hashing strategy
- `ADR-0012-infrastructure-as-code.md` - Terraform approach
- `ADR-0013-migration-squashing.md` - Database migration strategy

### Worker Architecture

The system uses **three separate Workers**:

1. **affilite-mix** (main): Handles all public routes, admin APIs, webhooks, queue consumer, crons
2. **affilite-mix-heavy-crons**: Heavy AI/commission/price scraping crons
3. **affilite-mix-log-shipper**: Tail consumer for log shipping

### Data Flow

```
User Request → Cloudflare Worker (WAF/Bot Protection) →
Middleware (Auth/CSP/Rate Limit) → Next.js App Router →
API Routes → DAL (Data Access Layer) → Supabase (RLS-defended)
```

### Security Model

**Multi-tenant isolation via:**

- Row-Level Security (RLS) in Supabase
- `site_id` derived from server-validated cookie (never query/body)
- `withAuthz` / `authorizeResource` guards on all admin routes
- Per-purpose internal API tokens (blast-radius reduction)

## 2. The 5 Critical Files (15 Minutes)

### 1. `lib/auth.ts` - Authentication Core

**Why important**: JWT signing, session management, token validation
**Key functions**: `createSession`, `validateSession`, `refreshSession`
**Security notes**: Dummy hash timing equalization, key rotation window

### 2. `lib/dal/` - Data Access Layer

**Why important**: All database access goes through DAL, not raw Supabase calls
**Key files**: `dal/*.ts` - Separates data access from business logic
**Pattern**: Each entity (products, users, etc.) has dedicated DAL file
**Security**: Enforces RLS, prevents direct table access

### 3. `lib/middleware/` - Request Processing

**Why important**: Host routing, CSP, CSRF, rate limiting applied here
**Key file**: `middleware.ts` - First line of defense for all requests
**Security**: Timing-safe CSRF, CSP nonces, rate limiting with DO/KV

### 4. `wrangler.jsonc` - Worker Configuration

**Why important**: Defines all Workers, bindings, routes, secrets
**Key sections**:

- `kv_namespaces` - Rate limiting and app cache
- `queues` - Click tracking queue
- `triggers` - Cron schedules
- `vars` - Production environment variables

### 5. `.github/workflows/deploy.yml` - Deployment Pipeline

**Why important**: How code gets to production, secret management
**Key stages**: validate → migrations → deploy → smoke test → health check
**Security**: Scoped API token enforcement, secret validation

## 3. Understanding the Tech Stack

### Frontend

- **Next.js 15** with App Router (not Pages)
- **Tailwind CSS** for styling
- **React** with server components preferred
- **TipTap** for rich text editing (admin only)

### Backend

- **Supabase** (Postgres + PostgREST + Auth + Storage)
- **Cloudflare Workers** (Edge computing)
- **Durable Objects** - Rate limiting and caching
- **Queues** - Async processing

### Security

- **JWT** for session tokens (with rotation support)
- **HMAC** for internal API authentication
- **Timing-safe comparisons** for CSRF protection
- **CSP with nonces** (strict-dynamic, no unsafe-inline)

## 4. Common Tasks

### Add a New API Endpoint

1. Create route file: `app/api/your-endpoint/route.ts`
2. Add appropriate auth guard: `withAuthz` or `requireAdmin`
3. Use DAL for data access, never direct Supabase calls
4. Add tests in `__tests__/api/your-endpoint.test.ts`

### Add Database Migration

1. Create file: `supabase/migrations/20260611XXXX_description.sql`
2. Create corresponding `-down.sql` for rollback
3. Test migration locally: `npm run db:migrate`
4. Run `scripts/check-migrations.sh` for policy compliance

### Add a New Environment Variable

1. Add to `.env.example` with description
2. Add to `lib/server-env.ts` if required for production
3. Document in relevant runbook or ADR
4. Add to deployment workflow if needed

### Deploy to Production

1. Push to main branch triggers automatic deploy
2. Monitor deployment workflow in GitHub Actions
3. Check smoke test and health check results
4. Verify in production logs

## 5. Security Considerations

### Never Do These Things

- ❌ Use query/body to derive `site_id` (must use server-validated cookie)
- ❌ Call Supabase directly without going through DAL
- ❌ Skip `withAuthz` or `requireAdmin` on admin routes
- ❌ Use `process.env` directly without type safety
- ❌ Commit secrets or keys to the repository
- ❌ Bypass rate limiting or CSRF protection

### Always Do These Things

- ✅ Use `withAuthz` / `authorizeResource` for tenant access
- ✅ Validate all input via `lib/validation.ts`
- ✅ Use timing-safe comparisons for security checks
- ✅ Log security events to audit log
- ✅ Test fail-open/fail-closed behavior
- ✅ Document security trade-offs in code comments

### Critical Security Controls

1. **Authentication**: `lib/auth.ts` - JWT with binding cookie + activity cookie
2. **Authorization**: `lib/authz.ts` - RBAC with site scoping
3. **CSRF**: `lib/csrf.ts` - Double-submit token with timing-safe compare
4. **SSRF**: `lib/ssrf-guard.ts` - Blocks internal IPs and cloud metadata
5. **Rate Limiting**: `lib/rate-limit.ts` - Distributed with DO/KV

## 6. Testing Strategy

### Test Categories

- **Unit tests**: `__tests__/*.test.ts` - Individual component testing
- **Integration tests**: `__tests__/*.integration.test.ts` - Database testing with Supabase
- **E2E tests**: `__tests__/*.spec.ts` - Playwright browser automation
- **Mutation tests**: `stryker.config.mjs` - Code coverage mutation testing

### Running Tests

```bash
# All tests
npm test

# Integration tests (requires TEST_WITH_SUPABASE=1)
TEST_WITH_SUPABASE=1 npm test

# E2E tests
npm run test:e2e

# Coverage report
npm run test:coverage
```

## 7. Troubleshooting Common Issues

### Local Development Issues

**Problem**: "Missing environment variable"
**Solution**: Check `.env.example`, copy required vars to `.env`

**Problem**: "Migration failed"
**Solution**: Check Supabase connection string, verify psql installed

**Problem**: "Worker won't start"
**Solution**: Check KV namespace IDs, verify Cloudflare API token

### Deployment Issues

**Problem**: "Secret validation failed"
**Solution**: Check required secrets in `.github/workflows/deploy.yml` header

**Problem**: "Migration rollback needed"
**Solution**: Use corresponding `-down.sql` file, see `docs/migration-rollback.md`

**Problem**: "Webhook failing"
**Solution**: Check Stripe webhook secret, verify `lib/stripe-event-processor.ts`

### Performance Issues

**Problem**: "Slow page loads"
**Solution**: Check ISR cache in R2, verify DO cache configuration

**Problem**: "High error rate"
**Solution**: Check Sentry for error patterns, verify rate limiting

## 8. Documentation Resources

### Essential Reading (Priority Order)

1. **README.md** - Project overview and quick start
2. **docs/CLOUDFLARE.md** - Cloudflare Workers setup and deployment
3. **docs/DR-RUNBOOK.md** - Incident response procedures
4. **docs/security.md** - Security policies and controls
5. **docs/iso27001-annex-a.md** - ISO 27001 compliance mapping

### ADRs (Architecture Decision Records)

- **ADR-0001**: Cloudflare Workers + OpenNext choice
- **ADR-0002**: Password hashing and upgrade strategy
- **ADR-0005**: Service role gateway pattern
- **ADR-0011**: Supabase connection pooling
- **ADR-0012**: Infrastructure as code approach
- **ADR-0013**: Migration squashing strategy

### Runbooks

- **docs/runbooks/**: Operational procedures for common incidents
- **docs/dr/**: Disaster recovery procedures
- **docs/ai-\***: AI governance and safety documentation

## 9. Getting Help

### Internal Resources

- **Project issues**: GitHub Issues (check existing first)
- **Architecture questions**: Review relevant ADRs
- **Security concerns**: Check `docs/security.md` and runbooks

### External Documentation

- **Next.js**: https://nextjs.org/docs
- **Supabase**: https://supabase.com/docs
- **Cloudflare Workers**: https://developers.cloudflare.com/workers
- **OpenNext**: https://opennext.js.org/cloudflare

## 10. Next Steps After Onboarding

1. **Fix a simple bug** - Get familiar with the codebase
2. **Add a small feature** - Practice the deployment process
3. **Review an ADR** - Understand architectural decisions
4. **Read security docs** - Understand security model
5. **Attend a deployment** - Learn the production process

## 11. Important Metrics to Monitor

- **Error rates**: Sentry dashboard
- **Worker performance**: Cloudflare Workers analytics
- **Database performance**: Supabase dashboard
- **Queue depth**: Click tracking queue DLQ
- **SLO compliance**: Burn rate alerts

## 12. Contact and Communication

- **Pull Request Template**: `.github/pull_request_template.md`
- **Security Issues**: Use `SECURITY.md` reporting process
- **Incident Response**: Follow `docs/DR-RUNBOOK.md`

---

**Remember**: This is a complex, security-sensitive system. When in doubt:

1. Read the relevant ADR
2. Check security docs
3. Ask questions before making changes
4. Test thoroughly before deploying
5. Monitor after deployment

# Affilite-Mix — Multi-Site Affiliate Platform

A multi-tenant affiliate content platform built with **Next.js 15** (App Router), **Supabase**, **Tailwind CSS v4**, and deployed to **Cloudflare Workers** via `@opennextjs/cloudflare`.

Each "site" (e.g. Arabic Tools, Crypto Tools) shares the same codebase but has its own domain, language, theme, and content.

## Features

- **Multi-site architecture** — domain-based routing via middleware; site configs in `config/sites/`
- **Admin panel** — content CMS, product management, category management, user accounts
- **Affiliate click tracking** — logs outbound clicks with source attribution
- **Newsletter signups** — per-site subscriber management with Turnstile captcha
- **Scheduled jobs** — publish/archive content and products on a schedule
- **SEO** — JSON-LD structured data, Open Graph, canonical URLs, sitemap
- **Security** — CSRF protection, rate limiting, HTML sanitization, bcrypt password hashing (with transparent PBKDF2 legacy upgrade), CSP headers

## Tech Stack

| Layer            | Technology                                    |
| ---------------- | --------------------------------------------- |
| Framework        | Next.js 15 (App Router)                       |
| Database         | Supabase (PostgreSQL + RLS)                   |
| Styling          | Tailwind CSS v4                               |
| Rich text editor | TipTap                                        |
| Image storage    | Cloudflare R2 (S3-compatible)                 |
| Bot protection   | Cloudflare Turnstile                          |
| Deployment       | Cloudflare Workers via `@opennextjs/cloudflare` |

## Getting Started

### Prerequisites

- Node.js 22+
- npm
- A Supabase project (free tier works)

### 1. Clone and install

```bash
git clone https://github.com/groupsmix/affilite-mix.git
cd affilite-mix
npm install
```

### 2. Set up environment variables

```bash
cp .env.example .env
```

Edit `.env` and fill in your values:

| Variable                         | Required | Description                                                             |
| -------------------------------- | -------- | ----------------------------------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`       | Yes      | Your Supabase project URL                                               |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY`  | Yes      | Supabase anon/public key                                                |
| `SUPABASE_SERVICE_ROLE_KEY`      | Yes      | Supabase service role key (server-only)                                 |
| `JWT_SECRET`                     | Yes      | Random 64-byte hex string for admin JWT signing                         |
| `ADMIN_PASSWORD`                 | No       | **Deprecated.** Legacy fallback — use DB-managed admin accounts instead |
| `CRON_SECRET`                    | Prod     | Secret for authenticating cron job requests                             |
| `R2_ACCOUNT_ID`                  | Optional | Cloudflare R2 account ID for image uploads                              |
| `R2_ACCESS_KEY_ID`               | Optional | R2 access key                                                           |
| `R2_SECRET_ACCESS_KEY`           | Optional | R2 secret key                                                           |
| `R2_BUCKET_NAME`                 | Optional | R2 bucket name                                                          |
| `R2_PUBLIC_URL`                  | Optional | Public URL for R2 bucket                                                |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | Optional | Turnstile site key (captcha)                                            |
| `TURNSTILE_SECRET_KEY`           | Optional | Turnstile secret key                                                    |
| `CLOUDFLARE_API_TOKEN`           | Deploy   | For cache purge operations                                              |
| `CLOUDFLARE_ZONE_ID`             | Deploy   | Cloudflare zone ID                                                      |

### 3. Set up the database

Apply all migrations to your Supabase project in order:

```bash
# Option 1 — Supabase CLI (recommended)
supabase db push

# Option 2 — Direct psql (apply each file in numbered order)
for f in supabase/migrations/*.sql; do psql "$SUPABASE_DB_URL" -f "$f"; done
```

> Migrations live in `supabase/migrations/` and are numbered sequentially.
> Do **not** apply `supabase/schema.sql` directly — it is a snapshot for reference only.

### 4. Run the dev server

```bash
npm run dev
```

The app will be available at [http://localhost:3000](http://localhost:3000).

> **Note:** In development, the middleware resolves `localhost` to the first registered site. To test multi-site routing, add entries to `/etc/hosts` or use the site aliases defined in `config/sites/`.

### 5. Access the admin panel

Navigate to [http://localhost:3000/admin/login](http://localhost:3000/admin/login) and log in with a database-managed admin account.

## Local Development

This project uses **domain-based multi-tenant routing**. In production, each site is served from its own domain (e.g. `wristnerd.site`). In development, the middleware automatically resolves `localhost` to the first registered site so you can get started immediately.

### Quick start (single site)

```bash
npm run dev
# Visit http://localhost:3000 — serves the first site in config/sites/index.ts
```

### Choosing a default site

Set the `NEXT_PUBLIC_DEFAULT_SITE` environment variable in your `.env` to control which site `localhost` resolves to:

```env
NEXT_PUBLIC_DEFAULT_SITE=watch-tools
```

Available site IDs are defined in `config/sites/` (e.g. `arabic-tools`, `crypto-tools`, `watch-tools`).

### Testing multi-site routing

Each site config can declare `aliases` (e.g. `watch.localhost`). To test multiple sites simultaneously:

1. Add entries to `/etc/hosts`:
   ```
   127.0.0.1  watch.localhost
   127.0.0.1  crypto.localhost
   127.0.0.1  arabic.localhost
   ```
2. Start the dev server: `npm run dev`
3. Visit `http://watch.localhost:3000`, `http://crypto.localhost:3000`, etc.

The middleware matches `*.localhost` subdomains against site alias prefixes automatically.

### Running tests

```bash
npm test              # Unit tests (Vitest)
npm run test:e2e      # End-to-end tests (Playwright)
```

## Scripts

| Command             | Description                                |
| ------------------- | ------------------------------------------ |
| `npm run dev`       | Start development server                   |
| `npm run build`     | Production build                           |
| `npm run start`     | Start production server                    |
| `npm run lint`      | Run ESLint                                 |
| `npm run typecheck` | Run TypeScript type checking               |
| `npm run preview`   | Build and preview Cloudflare Worker locally |
| `npm run deploy`    | Build and deploy to Cloudflare Workers      |

## Project Structure

```
├── app/
│   ├── (public)/          # Public-facing pages (home, content, categories, search)
│   │   └── components/    # Public UI components
│   ├── admin/             # Admin panel (content, products, categories, analytics)
│   │   └── components/    # Admin UI components
│   └── api/               # API routes (auth, admin CRUD, cron, newsletter, tracking)
├── config/
│   ├── site-definition.ts # SiteDefinition type
│   └── sites/             # Per-site configuration (domain, theme, nav, features)
├── lib/
│   ├── dal/               # Data Access Layer (Supabase queries)
│   ├── auth.ts            # JWT-based admin authentication
│   ├── csrf.ts            # CSRF double-submit cookie protection
│   ├── rate-limit.ts      # KV-backed rate limiter with in-memory fallback
│   ├── sanitize-html.ts   # HTML allowlist sanitizer
│   ├── validation.ts      # Input validation helpers
│   └── ...                # Other utilities
├── supabase/              # SQL schema, RLS policies, seed data
├── types/                 # TypeScript type definitions
└── .github/workflows/     # CI and deploy pipelines
```

## Adding a New Site

1. Create a new site config in `config/sites/` (copy an existing one as a template)
2. Add it to the `allSites` array in `config/sites/index.ts`
3. Insert a matching row into the `sites` database table
4. Point the domain's DNS to your Cloudflare Workers deployment

> **Note:** `next.config.ts` automatically derives `images.remotePatterns` from all registered sites — no manual update needed.

## Deployment

The project deploys to Cloudflare Workers via GitHub Actions (`.github/workflows/deploy.yml`).

Required GitHub Secrets:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `JWT_SECRET`
- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`

## Repository Name

> **Note:** The repository is named `affilite-mix` (missing an "a" in "affiliate"). This is a known typo. Renaming requires GitHub admin access and would break existing CI/CD integrations, deployment URLs, and git remotes. The typo does not affect functionality.

## License

Private — all rights reserved.

# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Password hashing upgraded from PBKDF2 to bcrypt with transparent migration on login
- Row Level Security hardened — replaced `USING (true)` with `auth.role() = 'service_role'` checks
- Rate limiting on all admin API endpoints (100 req/min per user)
- SVG excluded from image upload allowlist to prevent XSS
- SENTRY_DSN required in production environment validation
- Composite database indexes for common query patterns (content by site+status, products by site+category)
- Skip-to-content link for keyboard accessibility
- Cookie consent banner with privacy policy link
- E2E tests with Playwright (admin login, content management, newsletter signup, public pages, search)
- API reference documentation (`docs/api-reference.md`)
- Secrets rotation runbook (`docs/secrets-rotation-runbook.md`)
- Rollback strategy documentation (`docs/rollback-strategy.md`)
- Contributing guidelines (`CONTRIBUTING.md`)
- Prettier code formatting configuration
- Husky pre-commit hooks with lint-staged

### Security

- CSRF double-submit cookie pattern on all state-changing endpoints
- HTML sanitization with allowlist approach for user-generated content
- Rate limiting on login (5/15min per IP, 10/15min per email), newsletter (3/15min), click tracking (60/min)
- Admin session JWT with 24-hour expiry and automatic refresh

## [0.1.0] - 2026-03-01

### Added

- Initial release of Affilite-Mix multi-tenant affiliate platform
- Multi-site architecture with domain-based routing (arabic-tools, crypto-tools, watch-tools)
- Admin dashboard with content, product, and category management
- Affiliate click tracking with analytics
- Newsletter subscription with double opt-in
- Gift finder feature for watch-tools site
- Scheduled content publishing via Cloudflare Cron Triggers
- ISR caching with R2 storage
- SEO optimization with dynamic sitemaps and Open Graph tags
- Ad placement management
- Custom page builder
- Product import/export
- Site template system for creating new niches

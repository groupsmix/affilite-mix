# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| latest  | :white_check_mark: |

Only the latest version deployed from the `main` branch receives security updates.

## Reporting a Vulnerability

If you discover a security vulnerability, please report it responsibly.

**Do NOT open a public GitHub issue for security vulnerabilities.**

Instead, please email **security@groupsmix.com** with:

1. A description of the vulnerability
2. Steps to reproduce the issue
3. Potential impact assessment
4. Any suggested remediation (optional)

### What to expect

- **Acknowledgement**: Within 48 hours of your report.
- **Triage**: We will assess severity and impact within 5 business days.
- **Resolution**: Critical and high severity issues will be patched as soon as possible, typically within 14 days. Medium and lower severity issues are addressed in the next scheduled release.
- **Disclosure**: We will coordinate disclosure timing with you. We ask that you refrain from public disclosure until a fix is available.

### Scope

The following are in scope for security reports:

- Authentication and authorization bypasses
- Cross-site scripting (XSS), CSRF, or injection vulnerabilities
- Sensitive data exposure
- Server-side request forgery (SSRF)
- Remote code execution
- Privilege escalation
- Row-Level Security (RLS) bypass in Supabase/PostgreSQL

### Out of Scope

- Denial of service (DoS/DDoS) attacks
- Social engineering
- Issues in third-party dependencies (report these to the upstream project)
- Issues requiring physical access to a user's device

## Security Controls

This project implements the following security measures:

- **Authentication**: JWT-based auth with token binding, idle timeout, and revocation
- **Authorization**: Role-based access with `requireAdmin`, `withAuthz`, and `withAuthzDynamic` wrappers
- **Rate limiting**: Distributed rate limiting via Cloudflare KV/Durable Objects with fail-closed policy
- **Input validation**: Server-side validation on all API routes
- **CSRF protection**: Double-submit cookie pattern with HMAC verification
- **CSP**: Content Security Policy headers enforced via middleware
- **Secret scanning**: Gitleaks in CI prevents accidental secret commits
- **Dependency scanning**: npm audit and dependency-review-action in CI
- **Static analysis**: CodeQL SAST scanning on every PR
- **Database security**: Supabase Row-Level Security (RLS) policies with tenant isolation

## Security-Related Files

- [`/.github/workflows/security.yml`](.github/workflows/security.yml) - Dependency audit, license compliance, gitleaks
- [`/.github/workflows/codeql.yml`](.github/workflows/codeql.yml) - CodeQL static analysis
- [`/lib/auth.ts`](lib/auth.ts) - Authentication implementation
- [`/lib/authz.ts`](lib/authz.ts) - Authorization helpers
- [`/lib/rate-limit.ts`](lib/rate-limit.ts) - Rate limiting
- [`/lib/csrf.ts`](lib/csrf.ts) - CSRF protection
- [`/lib/csp.ts`](lib/csp.ts) - Content Security Policy
- [`/docs/threat-model.md`](docs/threat-model.md) - Threat model documentation
- [`/docs/incident-response.md`](docs/incident-response.md) - Incident response procedures

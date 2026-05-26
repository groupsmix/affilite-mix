# Code of Conduct

_SOC 2 Control CC1.1 — Integrity and Ethical Values_

## Purpose

This Code of Conduct establishes the ethical standards and professional expectations for all contributors to the affilite-mix platform. It supports our commitment to integrity, security, and responsible data handling as required by SOC 2 Type II compliance.

## Scope

This policy applies to all team members, contractors, and automated systems that interact with the affilite-mix codebase, infrastructure, or customer data.

## Core Principles

### 1. Data Privacy and Security

- **Never** log, expose, or transmit personally identifiable information (PII) outside approved channels.
- All database queries must use the Data Access Layer (DAL) with tenant scoping (`site_id`). Direct `sb.from()` calls outside the DAL are forbidden by ESLint rules.
- Service-role access must go through the approved gateway (`lib/server-only/service-role.ts`).
- Secrets and credentials must never be committed to the repository. Use environment variables and the secrets management system.

### 2. Access Control

- Follow the principle of least privilege. Request only the permissions needed for your role.
- RBAC roles are defined in `config/rbac/roles.json` and enforced by `lib/authz.ts`.
- Separation of duties is enforced: see `tools/sod-check.ts` and the constraints in the RBAC configuration.
- Never share credentials, API keys, or session tokens.

### 3. Code Quality

- All code changes must pass CI checks (type-check, lint, tests) before merge.
- Security-sensitive changes require review from a team member with the appropriate role.
- Follow established patterns: use the DAL for database access, structured logging via `lib/logger.ts`, and Zod validation for all API inputs.

### 4. Incident Response

- Report security vulnerabilities through the process documented in `.well-known/security.txt`.
- Do not attempt to exploit, test, or probe vulnerabilities in production systems without authorization.
- Follow the incident response runbooks in `docs/runbooks/` for operational issues.

### 5. Multi-Tenant Integrity

- Never bypass Row-Level Security (RLS) policies.
- All data access must be scoped to the authenticated tenant's `site_id`.
- Cross-tenant data access is a critical security violation.

### 6. Professional Conduct

- Treat all team members with respect and professionalism.
- Provide constructive feedback in code reviews.
- Document architectural decisions in ADRs (`docs/adr/`).
- Keep documentation current when making significant changes.

## Enforcement

Violations of this Code of Conduct will be reviewed by the team lead. Depending on severity:

1. **Minor** (style, documentation): addressed in code review.
2. **Moderate** (access control bypass, missing validation): requires immediate fix and post-mortem.
3. **Critical** (data breach, credential exposure, cross-tenant leak): triggers incident response and may result in access revocation.

## Acknowledgment

By contributing to this repository, you agree to abide by this Code of Conduct and the security policies documented in `docs/security-policy.md` and `docs/soc2-controls-mapping.md`.

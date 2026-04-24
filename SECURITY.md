# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 0.x     | :white_check_mark: |
| < 0.1   | :x:                |

## Reporting a Vulnerability

We take security vulnerabilities seriously. If you discover a security issue, please report it responsibly.

### How to Report

1. **Do NOT** create a public GitHub issue for security vulnerabilities
2. Email security vulnerabilities to: `security@[domain]`
3. Include as much detail as possible:
   - Description of the vulnerability
   - Steps to reproduce
   - Potential impact
   - Any suggested mitigations (if known)

### Response Timeline

- **Acknowledgement**: Within 48 hours
- **Initial Assessment**: Within 7 days
- **Fix Timeline**: varies by severity (critical: 24-72h, high: 1-2 weeks, medium: 1 month)

### Security Updates

Security updates are released as patch versions and announced via:

- GitHub Security Advisories
- Release notes with `[SECURITY]` prefix

## Security Best Practices

### For Administrators

- Use strong, unique passwords with TOTP 2FA enabled
- Rotate `CRON_SECRET`, `JWT_SECRET`, and Stripe keys periodically
- Monitor Sentry for unusual activity patterns
- Review audit logs regularly

### Environment Variables

Required security-sensitive variables:

- `STRIPE_SECRET_KEY` - Stripe API key
- `CRON_SECRET` - Cron job authentication
- `JWT_SECRET` - JWT signing
- `SENTRY_DSN` - Error tracking
- `TURNSTILE_SECRET_KEY` - CAPTCHA verification

Never commit `.env` files or secrets to version control.

### Rate Limiting

All public API endpoints have rate limiting enabled:

- Login: 5 attempts/15min per IP
- Community endpoints: 5-10 requests/hour per IP
- Webhooks: protected by signature verification

### Content Security Policy

The application enforces strict CSP headers:

- `frame-ancestors 'none'` - prevents clickjacking
- `object-src 'none'` - prevents plugin-based attacks
- Strict connect-src policy limiting external connections

## Known Attack Surfaces

### User Input

- All user-submitted content (comments, wrist shots) goes through moderation
- XSS protection via sanitization library
- CAPTCHA verification on public submission endpoints

### Authentication

- JWT-based authentication with IP-binding
- 30-minute idle timeout
- 12-hour absolute session age
- TOTP 2FA support for admin accounts

### API Security

- CSRF protection for state-changing requests
- Stripe webhook signature verification (HMAC-SHA256)
- Cron endpoints secured with timing-safe Bearer token comparison

## Compliance

This application follows these security standards:

- OWASP Top 10 awareness
- Defense in depth
- Principle of least privilege
- Secure by default configuration

# Red-Team Rules of Engagement (OF-22)

Owner: Security. Last reviewed: 2026-05-01.

## Scope (in)

- \*.groupsmix.com production + staging
- Cloudflare Workers + Pages
- Supabase project (read-only DB probes; no destructive payloads)

## Scope (out)

- Third-party SaaS (Stripe, Resend, Sentry)
- Customer data exfiltration (use synthetic accounts)
- DDoS/load attacks above 50 rps

## Deconfliction

- Notify #sec-deconfliction Slack and on-call before each window.
- Tag traffic with `X-RT-Run: <run_id>` so WAF/SIEM can correlate.

## Success criteria

- Map each finding to MITRE ATT&CK technique IDs.
- Severity per CVSS 3.1 with environmental score.

## Reporting + retest cadence

- Initial report within 5 business days.
- Critical findings re-tested within 14 days of fix; others within 30.
- Quarterly purple-team exercise; annual external red-team.

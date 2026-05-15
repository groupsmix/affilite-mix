# Tabletop Exercise Scenarios

> **A189 Remediation** — Quarterly security tabletop exercise scripts.
> Run these exercises with all engineers, the on-call rotation, and at least one executive.
> Document outcomes, gaps found, and action items in the post-exercise report.
>
> **Cadence:** Once per quarter minimum. Schedule in advance; announce roles 1 week before.  
> **Duration:** 90 minutes per scenario.  
> **Facilitator:** Security lead or external red-team facilitator.

---

## Scenario 1 — Production Database Ransomware

**Setup:** At 03:00 UTC on a Tuesday, the on-call engineer receives a PagerDuty alert: all Supabase queries returning 500 errors. 5 minutes later, a message appears in Slack: "Your database has been encrypted. Pay 10 BTC to [address] within 48 hours."

**Inject questions (every 15 minutes):**
1. Who is the incident commander? Who declares P0?
2. How do you verify the claim? What do Cloudflare logs show?
3. Can you restore from backup? What is your last known-good PITR point?
4. Do you pay? Who authorizes that decision?
5. When do you notify customers? Who drafts the message?
6. When do you notify the supervisory authority (GDPR 72h clock)?
7. How do you prevent reinfection before restoring?

**Expected outcomes:**  
- Incident commander declared within 5 minutes  
- Supabase PITR restore procedure confirmed working  
- RTO/RPO documented  
- Legal counsel engaged within 30 minutes

---

## Scenario 2 — Insider Data Exfiltration

**Setup:** HR notifies engineering that a senior engineer resigned yesterday and their last day was immediate. The security team notices a spike in Cloudflare Worker logs showing 50,000 `SELECT *` queries against the `newsletter_subscribers` table 2 hours before their offboarding.

**Inject questions:**
1. Do you have evidence of exfiltration or just anomalous access?
2. Which systems did this employee have access to? How quickly can you revoke?
3. Can you reconstruct what data was accessed from the audit log?
4. Do you notify affected users? Under what legal threshold?
5. Do you involve law enforcement? When?
6. Was there a signed exit checklist? Was a legal hold issued?

**Expected outcomes:**  
- All access (GitHub, Cloudflare, Supabase, Stripe, Resend) revoked within 1 hour  
- Audit log evidence preserved  
- Legal counsel engaged before any external communication

---

## Scenario 3 — GitHub Credentials Leak / Supply Chain Attack

**Setup:** GitHub sends an automated "secret exposed" email. The leaked secret is `STRIPE_SECRET_KEY` — the live key was accidentally pushed to a public fork by a contractor. Additionally, GitHub's dependency graph shows a recently merged PR introduced a dependency whose maintainer account was compromised last week (verified via public disclosure).

**Inject questions:**
1. How do you triage: is the Stripe key already being used by an attacker?
2. How quickly can you rotate the key? What is the blast radius of the new key during rotation?
3. For the compromised dependency: can you pin a known-good commit? Can you remove it?
4. How do you assess what the malicious package may have done (post-install scripts, side channels)?
5. Do you need to notify Stripe?

**Expected outcomes:**  
- Stripe key rotated within 15 minutes  
- Dependency removed or pinned within 2 hours  
- SBOM/SCA scan run against all dependencies  
- Zero trust: assume post-install scripts ran in CI environment; rotate all CI secrets

---

## Scenario 4 — Cloudflare Account Takeover

**Setup:** An attacker phishes an engineer's Cloudflare account credentials. The attacker adds a malicious Worker route that proxies all traffic through their server for 45 minutes before being detected.

**Inject questions:**
1. How do you detect this? (Cloudflare audit logs, Worker version history?)
2. How do you remove the malicious route? How quickly?
3. What user data was exposed during the 45-minute window?
4. Were HTTPS connections decrypted? (They were not, but participants should reason through it.)
5. How do you harden to prevent recurrence (hardware MFA, IP allow-list on CF dashboard)?

**Expected outcomes:**  
- Malicious configuration removed within 30 minutes  
- All Cloudflare account credentials rotated  
- Hardware MFA (YubiKey) policy enforced for all Cloudflare accounts  
- Customer notification drafted

---

## Scenario 5 — AI Provider Data Exfiltration

**Setup:** A security researcher reports that the AI content generation endpoint (`/api/cron/ai-generate`) can be manipulated via prompt injection to exfiltrate the system prompt, which contains a hard-coded tenant-specific configuration string that reveals internal business logic.

**Inject questions:**
1. Is the system prompt actually sensitive? Does it contain secrets?
2. How do you determine if this was exploited in production? (Logs? Request patterns?)
3. What is your response: patch immediately, disable the endpoint, or accept risk?
4. Is there a CVE? Do you need to publish a security advisory?

**Expected outcomes:**  
- System prompt reviewed and scrubbed of sensitive data within 24 hours  
- Output scanner deployed to detect prompt-injection exfiltration patterns  
- Responsible disclosure response sent to researcher within 48 hours

---

## Post-Exercise Report Template

```markdown
## Tabletop Exercise Report — [SCENARIO NAME] — [DATE]

**Facilitator:** [Name]
**Participants:** [List roles, not names]
**Duration:** [X minutes]

### What went well
- [List]

### Gaps identified
- [Gap 1]: [Impact] → [Action item] → [Owner] → [Due date]
- [Gap 2]: ...

### Action items
| Item | Owner | Due | Status |
|------|-------|-----|--------|
| | | | |

### Follow-up exercise scheduled
[Date + scenario]
```

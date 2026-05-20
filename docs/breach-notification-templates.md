# Breach Notification Templates

> **A190 Remediation** — Pre-approved communication templates for regulatory breach notifications.
> All templates must be reviewed by legal counsel before first use. Fill in `[BRACKETED]` fields per incident.

---

## 1. GDPR Art. 33 — Supervisory Authority (72-hour window)

**To:** [Lead supervisory authority, e.g. ICO, CNIL, DPC — determined by establishment location]  
**Subject:** Personal Data Breach Notification — [Company Name] — Incident [INCIDENT-ID]

---

> [Company Name] ("the Controller") hereby notifies [Supervisory Authority] of a personal data breach pursuant to Article 33 GDPR.

**1. Nature of the breach**  
[Describe: what happened, how it was discovered, attack vector if known]

**2. Categories and approximate number of data subjects concerned**  
Estimated [N] data subjects. Categories: [email addresses / transaction data / usage logs / etc.]

**3. Categories and approximate number of personal data records concerned**  
[N] records. Data types: [list columns / tables affected]

**4. Name and contact details of the DPO or other contact point**  
[Name], [email], [phone]

**5. Likely consequences of the breach**  
[Phishing risk / account takeover risk / financial fraud risk / etc.]

**6. Measures taken or proposed**  
- Immediate: [rotated secrets / revoked sessions / blocked attacker IP / etc.]
- Short-term (30 days): [patching plan / additional monitoring / etc.]
- Long-term: [architectural changes / encryption upgrade / etc.]

---

## 2. GDPR Art. 34 — Notification to Data Subjects (when "high risk")

**Subject:** Important security notice regarding your account

> Dear [Customer],
>
> We are writing to inform you of a security incident that may have affected your personal information held by [Company Name].
>
> **What happened:** [Plain-language description]
>
> **What information was involved:** [Email address / name / usage data — be specific]
>
> **What we are doing:** We have [taken the following steps...]. We are also [working with authorities / engaging a forensics firm / etc.].
>
> **What you can do:** We recommend you [change your password / monitor your email for phishing / enable 2FA / etc.].
>
> If you have questions, please contact us at security@groupsmix.com.
>
> Sincerely,  
> [CEO Name]  
> [Company Name]

---

## 3. SEC Item 1.05 Form 8-K (US public companies / if applicable)

> [Company] experienced a cybersecurity incident on or about [DATE]. [Brief factual description]. The Company has determined that the incident is material [or: has not yet determined materiality as of the date of this filing]. [Description of response measures]. [Forward-looking statement safe harbor].

*Note: 8-K must be filed within 4 business days of materiality determination. Engage securities counsel immediately.*

---

## 4. US State Breach Notification (CCPA / state laws)

**Deadlines vary:** CA = 72h to AG if >500 residents; NY SHIELD = expedient; TX = 60 days; etc.

**Subject:** Notice of Data Breach — [Company Name]

> [Company Name] is notifying you of a data breach that may have affected California (or state) residents.
>
> **Date breach discovered:** [DATE]  
> **Date breach occurred (if known):** [DATE or "under investigation"]  
> **Data elements involved:** [list]  
> **Actions taken:** [list]  
> **Steps you can take:** [list]  
> **Contact:** [email / phone / toll-free]

---

## 5. Internal War-Room Comms (Slack / email to leadership)

```
INCIDENT DECLARED — [SEVERITY P0/P1]
Incident commander: [NAME]
War-room channel: #incident-[YYYYMMDD]
Bridge/call: [LINK]
Status page: [URL]
Time declared: [ISO timestamp UTC]

Situation: [2-sentence summary]
Known impact: [users / data / services affected]
Current containment status: [CONTAINED / IN PROGRESS / UNKNOWN]
Next update: [HH:MM UTC]
```

---

## Escalation Matrix

| Time since detection | Action |
|---|---|
| 0–30 min | Incident commander declared, war-room open, technical containment starts |
| 30–60 min | Executive team notified, legal/DPO engaged, evidence preservation starts |
| 1–4 hrs | Board chair notified (P0), PR firm engaged (P0), forensics firm engaged |
| 24 hrs | Internal post-mortem timeline started |
| 72 hrs | GDPR supervisory authority notified (if applicable) |
| 96 hrs | SEC 8-K filed (if material, US-listed) |
| 30 days | State law notifications complete, interim post-mortem published |
| 14 days | Full post-mortem with root cause and remediation plan published internally |

---

## Legal Hold Checklist

- [ ] Preserve all logs (do NOT rotate or delete) — snapshot R2 bucket immediately
- [ ] Capture memory dumps / disk images of affected systems
- [ ] Preserve git history, deployment artifacts, and config as of the incident window
- [ ] Issue legal hold notices to all relevant personnel
- [ ] Document chain of custody for all forensic evidence
- [ ] Engage outside counsel before making public statements

# Audit History (Historical / Superseded)

> **STATUS: HISTORICAL.** The documents in this folder are point-in-time
> snapshots of past audits and remediation efforts. They are retained for
> traceability and evidence, **not** as a description of the current state of
> the codebase. Individual findings referenced here may since have been fixed,
> re-scoped, or superseded. Do **not** treat any single file here as the
> current launch/security status.

For the current state, rely on:

- The live test suite, `tsc`, ESLint, and Knip results (all gating in CI).
- `../../SECURITY.md` and the `docs/` runbooks for current policy.
- The Git history for the authoritative timeline of changes.

## Contents

| File                           | What it was                           | Notes                                                                               |
| ------------------------------ | ------------------------------------- | ----------------------------------------------------------------------------------- |
| `affilite-mix-AUDIT(15).md`    | Season 15 full audit report           | Historical; most concrete code findings remediated in later commits.                |
| `audit-16.md`                  | Season 16 audit report                | Historical; captured at an earlier commit.                                          |
| `AUDIT-REMEDIATION-SUMMARY.md` | Remediation summary + launch decision | Point-in-time; includes deferred items (multi-region, DB-level RLS).                |
| `E2-08-REMEDIATION-GUIDE.md`   | Étap-2 finding #08 remediation guide  | Historical.                                                                         |
| `E2-REMEDIATION-SUMMARY.md`    | Étap-2 remediation summary            | Historical.                                                                         |
| `F-010-REMEDIATION-SUMMARY.md` | Finding F-010 evidence/summary        | Historical evidence.                                                                |
| `F-011-EVIDENCE.md`            | Finding F-011 evidence                | Historical evidence.                                                                |
| `FIXES-APPLIED.md`             | Snapshot of a batch of fixes          | Superseded by Git history.                                                          |
| `LAUNCH-READINESS-ANALYSIS.md` | Launch-readiness snapshot             | Superseded; the "critical blockers" it lists (typecheck/ESLint/tests) are resolved. |
| `PR-SUMMARY.md`                | Summary for a specific PR             | Historical.                                                                         |

> Cross-references between files in this folder are relative and remain valid
> because the files were relocated together as a group.

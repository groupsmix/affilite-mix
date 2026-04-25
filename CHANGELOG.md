# Release Management & Changelog

## Process
Every production release must be documented here. It must include:
1. **Commit:** The deployment SHA.
2. **Migration Changes:** Any new database schemas or policies.
3. **Feature Changes:** What was built or fixed.
4. **Risk Level:** High, Medium, or Low.
5. **Rollback Notes:** How to safely revert the changes if issues occur.

---

## [Unreleased]
- Initial hardening wave (P0, P1, P2 Launch Blockers).
- **Risk Level:** High
- **Rollback Notes:** Use `-down.sql` migrations if necessary. Workers can be rolled back via Cloudflare dashboard.

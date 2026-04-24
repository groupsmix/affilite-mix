# Access Recertification Policy & Log

## Overview

This document serves as the formal record for our quarterly access recertification process. To maintain a secure environment and adhere to compliance standards (e.g., SOC 2), we require a documented quarterly review of all users who hold administrative access to our critical infrastructure, specifically **Supabase**, **Cloudflare**, and **GitHub**.

## Policy

- **Frequency**: Access reviews must be conducted at least once per quarter.
- **Principle of Least Privilege**: Access should only be granted to individuals whose current role explicitly requires it.
- **Offboarding**: Access for terminated or transferred employees must be revoked immediately upon departure; this quarterly review serves as a secondary catch-all audit.

## Procedure

1. **Export Rosters**: The reviewer exports or reviews the current list of users with Admin/Owner access from:
   - **Supabase**: Organization Settings > Team
   - **Cloudflare**: Account > Members
   - **GitHub**: Organization > People (Filter by role: Owner/Admin)
2. **Review Access**: Compare the exported lists against the current active employee roster and their job responsibilities.
3. **Revoke Access**: Remove or downgrade access for any user who no longer requires administrative privileges.
4. **Document**: Record the audit in the **Recertification Log** below, detailing any actions taken.

---

## Recertification Log

Please add a new row to this table each time a quarterly review is completed.

| Date       | Reviewer        | Systems Reviewed             | Findings & Actions Taken                                                                                                                                 | Next Review Due |
| :--------- | :-------------- | :--------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------- | :-------------- |
| YYYY-MM-DD | [Reviewer Name] | Supabase, Cloudflare, GitHub | _Example: Reviewed all admins. Removed [User] from GitHub as they transitioned to a non-technical role. Supabase and Cloudflare access were up to date._ | YYYY-MM-DD      |
|            |                 |                              |                                                                                                                                                          |                 |
|            |                 |                              |                                                                                                                                                          |                 |
|            |                 |                              |                                                                                                                                                          |                 |

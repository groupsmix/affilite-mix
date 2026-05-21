# Break-Glass Access Procedure

## Purpose
This document defines the process for utilizing the `break_glass` role. The `break_glass` role provides emergency bypass access to all tenants and operations in the event of an incident where normal authorization paths are broken or insufficient.

## When to Use
The `break_glass` role should ONLY be used when:
1. A Sev-0 or Sev-1 incident is actively occurring.
2. Normal authorization mechanisms are unavailable or insufficient to mitigate the incident.
3. Access has been explicitly authorized by an incident commander.

## How it Works
- The `break_glass` role bypasses all site-scoped role checks (`hasPermission` always returns `true`).
- Any API route protected by `withAuthz`, `withAuthzDynamic`, or `authorizeResource` will generate a **high-priority audit log event** (`break_glass_access` or `break_glass_resource_access`) when accessed by a user with the `break_glass` role.
- These audit logs include the exact method, URL, and route parameters accessed, as well as the actor's identity.

## Procedure
1. The Incident Commander approves the use of break-glass access.
2. A Database Administrator escalates an existing user's global role to `break_glass` directly in the database:
   ```sql
   UPDATE admin_users SET role = 'break_glass' WHERE email = 'incident.responder@example.com';
   ```
3. The responder logs in (or refreshes their token) to receive the `break_glass` JWT claim.
4. The responder performs the necessary mitigation actions.
5. **CRITICAL:** Once mitigation is complete, the DBA must immediately revert the user's role:
   ```sql
   UPDATE admin_users SET role = 'admin' WHERE email = 'incident.responder@example.com';
   ```
6. The responder logs out to invalidate the break-glass session.

## Post-Incident
After the incident is resolved, the Security team must review the `audit_log` table for all `break_glass_access` events and verify that each action taken was necessary and authorized.

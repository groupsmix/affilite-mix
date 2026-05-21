# Break-Glass Access Procedure (A181)

## Overview
In the event of a total identity provider (IdP) failure, catastrophic DNS failure blocking SSO, or loss of all primary `super_admin` credentials, emergency "break-glass" access is required to maintain system availability and security posture.

## The Break-Glass Accounts
Two dedicated break-glass accounts exist in the production environment:
1. `breakglass1@affilite.mix`
2. `breakglass2@affilite.mix`

These accounts are provisioned with the `super_admin` role.

## Activation Procedure
1. Retrieve the heavily encrypted credentials and hardware FIDO2 key for the break-glass account from the physical vault / highly restricted secrets manager (e.g., AWS Secrets Manager under cross-account IAM locks).
2. Authenticate at the standard admin login route.
3. **AUTOMATED ALARM:** The moment a `breakglass*` email successfully authenticates, the system automatically dispatches a P0 `fatal` exception to Sentry and emits a high-priority `breakglass_activated` audit event. This immediately pages the entire security incident response team.

## Post-Incident
Within 24 hours of activation, the break-glass account's password MUST be rotated, its TOTP/FIDO2 hardware key re-enrolled, and a post-mortem filed detailing why emergency access was invoked.

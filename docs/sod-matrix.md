# Separation of Duties Matrix (OF-28)

| Role       | Permissions (allow)            | Forbidden combinations |
| ---------- | ------------------------------ | ---------------------- |
| ai_drafter | ai.draft.create, ai.draft.read | + content.publish      |
| publisher  | content.publish, content.read  | + ai.draft.create      |
| finance    | payments.read, payments.refund | + payments.approve     |
| approver   | payments.approve               | + payments.refund      |
| auditor    | audit.read                     | + audit.purge          |
| dpo        | gdpr.dsar.\*                   | + content.publish      |

CI enforcement: `tools/sod-check.ts` runs against `config/rbac/roles.json`.

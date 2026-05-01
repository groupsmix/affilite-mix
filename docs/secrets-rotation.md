# Secrets rotation cadence (OF-34)

| Secret                    | Cadence                                 | Mechanism                            | Last rotated |
| ------------------------- | --------------------------------------- | ------------------------------------ | ------------ |
| CRON_SECRET               | 90 days                                 | CI workflow `rotate-cron-secret.yml` | YYYY-MM-DD   |
| INTERNAL_API_TOKEN        | 90 days                                 | manual (until 2026-Q3)               | YYYY-MM-DD   |
| SUPABASE_SERVICE_ROLE_KEY | 180 days                                | Supabase rotate + redeploy           | YYYY-MM-DD   |
| JWT_SECRET                | 90 days                                 | overlap window                       | YYYY-MM-DD   |
| STRIPE_WEBHOOK_SECRET     | per release of webhook signature scheme | Stripe dashboard                     | YYYY-MM-DD   |
| RESEND_API_KEY            | 180 days                                | Resend dashboard                     | YYYY-MM-DD   |

Evidence: rotation runs are logged to `audit_log` with action `secrets.rotate`.

# SOC 2 Controls Mapping (OF-20)

| Control                    | Evidence                              | Owner  |
| -------------------------- | ------------------------------------- | ------ |
| CC1.1 Integrity & ethics   | `docs/code-of-conduct.md`             | People |
| CC1.2 Board oversight      | Quarterly security review minutes     | CEO    |
| CC2.1 Communication        | `docs/communication-policy.md`        | People |
| CC3.1 Risk assessment      | `docs/risk-register.md`               | Sec    |
| CC4.1 Monitoring           | `docs/observability/*`                | SRE    |
| CC5.1 Control activities   | This file + IaC                       | Sec    |
| CC6.1 Logical access       | `docs/sod-matrix.md`                  | Sec    |
| CC7.1 System operations    | Cloudflare alert policies             | SRE    |
| CC8.1 Change management    | Branch protection (OF-08) + CHANGELOG | Eng    |
| CC9.1 Risk mitigation      | Incident response runbook             | Sec    |
| PI1.1 Processing integrity | `tests/integration/*`                 | Eng    |
| A1.1 Availability          | SLO doc + alerts (OF-06)              | SRE    |
| C1.1 Confidentiality       | Encryption-at-rest + KMS              | Sec    |
| P1-P8 Privacy              | `docs/privacy/*`                      | DPO    |

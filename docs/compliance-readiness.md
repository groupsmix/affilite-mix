# Compliance Readiness (OF-19, OF-20 evidence pointers)

## PCI SAQ A

- Card data never touches our servers (Stripe Elements + Checkout).
- ASV scan vendor: **SecurityMetrics** (PCI-DSS QSA/ASV). Cadence: quarterly. Last completed: `2026-03-15`.
- Annual penetration test: **BreachLock** (CREST-accredited). Last completed: `2026-01-20`.
- Evidence repository: `s3://groupsmix-compliance/pci/` — access restricted to DPO and CISO.
- Note: Card data never touches our servers — we use Stripe Elements + Checkout (SAQ A scope).
- Evidence repository: `s3://groupsmix-compliance/pci/`.

## SOC 2 (Type II target)

See `docs/soc2-controls-mapping.md`.

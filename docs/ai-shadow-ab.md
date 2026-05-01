# AI shadow / A-B path (OF-38)

Not in scope until model selection becomes business-critical. Future plan:
- Dual-call pattern via `lib/ai/shadow.ts` (primary returns; shadow logs only).
- Compare output via offline judge (see OF-21 eval runner).
- Promote on >5% factuality lift over 2 weeks at p<0.05.

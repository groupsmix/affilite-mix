# Stripe Tax / VAT-GST Plan (OF-10)

Decision: enable Stripe Tax with `automatic_tax: { enabled: true }` and
`tax_id_collection.enabled: true` on Checkout sessions and subscriptions.

Nexus map (initial): US-DE (HQ), EU (Stripe Tax for VAT), UK (VAT), AU (GST).

Action items:

1. Toggle Stripe Tax in dashboard for prod + test mode.
2. Add `automatic_tax` to all `checkout.sessions.create` and
   `subscriptions.create` calls (search: `stripe.checkout`/`stripe.subscriptions`).
3. Persist `tax_ids` collected from customers to `memberships.tax_id`.
4. Quarterly review of nexus changes; reassess Stripe Tax vs TaxJar/Avalara
   when monthly tax volume > $50k.

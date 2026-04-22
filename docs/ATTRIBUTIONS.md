# Attributions

This project uses code and patterns from the following open-source projects.
All are MIT-licensed (or equivalent permissive license) unless otherwise noted.

## Direct Dependencies (MIT)

| Source                                                              | What We Use                                                     | License |
| ------------------------------------------------------------------- | --------------------------------------------------------------- | ------- |
| [vanilla-cookieconsent](https://github.com/orestbida/cookieconsent) | Consent Management Platform (cookie banner + preferences modal) | MIT     |
| [otpauth](https://github.com/nicot/otpauth)                         | TOTP 2FA enrollment and verification                            | MIT     |
| [qrcode](https://github.com/soldair/node-qrcode)                    | QR code generation for TOTP enrollment                          | MIT     |
| [@next/bundle-analyzer](https://github.com/vercel/next.js)          | Bundle size analysis in CI                                      | MIT     |

## Architecture References (clean-room, no code copied)

| Source                                                 | What We Learned                                                                   | License  | Notes                                                                        |
| ------------------------------------------------------ | --------------------------------------------------------------------------------- | -------- | ---------------------------------------------------------------------------- |
| [dub](https://github.com/dubinc/dub)                   | `/r/[shortcode]` edge redirect architecture, click tracking pipeline, geo-routing | AGPL-3.0 | Clean-room implementation — architecture studied, code written independently |
| [formbricks](https://github.com/formbricks/formbricks) | Quiz funnel branching logic, conditional question flow                            | AGPL-3.0 | Architecture reference only                                                  |
| [growthbook](https://github.com/growthbook/growthbook) | A/B testing deterministic bucketing, experiment definition patterns               | MIT      | Will integrate SDK directly when A/B testing is built                        |

## UI Component Sources (MIT)

| Source                                                                                  | What We Took                                                          | License |
| --------------------------------------------------------------------------------------- | --------------------------------------------------------------------- | ------- |
| [shadboard (Qualiora)](https://github.com/Qualiora/shadboard)                           | Admin shell, sidebar, topbar, settings page structure, cards, dialogs | MIT     |
| [data-table-filters (openstatusHQ)](https://github.com/openstatusHQ/data-table-filters) | Table/filter/search/sort UX patterns, faceted filters                 | MIT     |

## Future References (not yet used)

| Source                                                      | Planned Use                                     | License  |
| ----------------------------------------------------------- | ----------------------------------------------- | -------- |
| [vercel/commerce](https://github.com/vercel/commerce)       | Product card, comparison row components         | MIT      |
| [next-seo](https://github.com/garmeeh/next-seo)             | SEO + JSON-LD helpers                           | MIT      |
| [remark42](https://github.com/umputun/remark42)             | Self-hosted comments for UGC                    | MIT      |
| [listmonk](https://github.com/knadh/listmonk)               | Newsletter/drip campaign state machine patterns | AGPL-3.0 |
| [meilisearch](https://github.com/meilisearch/meilisearch)   | Faceted product search                          | MIT      |
| [cookieconsent](https://github.com/orestbida/cookieconsent) | Already integrated                              | MIT      |

---

**License rule**: This repo is closed-source. MIT/Apache-2/BSD code is copied with attribution.
AGPL/GPL code is studied for architecture only — implementations are written independently.

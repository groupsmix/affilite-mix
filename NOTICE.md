# NOTICE

This project incorporates third-party open-source work. Attribution and license
summaries for every donor are listed below. Direct copies retain the original
copyright header in the copied file; adapted files carry a one-line comment
pointing at the upstream source and commit.

---

## shadcn/ui

- **Upstream:** https://github.com/shadcn-ui/ui
- **License:** MIT © shadcn
- **What we use:** primitive React components generated via the official
  `shadcn@latest` CLI into `components/ui/*`, together with the standard
  `cn(...)` helper in `lib/utils.ts`.
- **Status:** generated verbatim — no behavioural adaptation. Component files
  retain their upstream structure; only Tailwind token names resolve to the
  host site's tenant theme (see `app/globals.css`).

---

## arhamkhnz/next-shadcn-admin-dashboard

- **Upstream:** https://github.com/arhamkhnz/next-shadcn-admin-dashboard
- **License:** MIT
- **What we use:** auth screen layout adapted — centered card composition on
  `app/admin/login/page.tsx` and `app/admin/reset-password/page.tsx`. Only
  visual structure (Card composition, spacing, typography) was adapted; form
  logic, CSRF wiring, and Turnstile integration remain this project's own.

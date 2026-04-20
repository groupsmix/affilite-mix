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

## Qualiora/shadboard

- **Upstream:** https://github.com/Qualiora/shadboard
- **License:** MIT © Qualiora
- **What we use:** admin shell layout patterns (collapsible icon-rail sidebar,
  topbar with breadcrumbs and user menu, page header component) adapted into
  `components/admin/*` on top of the existing shadcn/ui primitives.
- **Status:** patterns only — no source files copied. Each adapted file carries
  a one-line `// Layout patterns adapted from ...` comment pointing here.

---

## arhamkhnz/next-shadcn-admin-dashboard

- **Upstream:** https://github.com/arhamkhnz/next-shadcn-admin-dashboard
- **License:** MIT
- **What we use:** auth screen layout adapted — centered card composition on
  `app/admin/login/page.tsx` and `app/admin/reset-password/page.tsx`. Only
  visual structure (Card composition, spacing, typography) was adapted; form
  logic, CSRF wiring, and Turnstile integration remain this project's own.

---

## openstatusHQ/data-table-filters

- **Upstream:** https://github.com/openstatusHQ/data-table-filters
- **License:** MIT
- **What we use:** DataTable, faceted filters, toolbar, pagination, view options,
  URL-sync patterns adapted into `components/data-table/*`.

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

## openstatusHQ/data-table-filters

- **Upstream:** https://github.com/openstatusHQ/data-table-filters
- **License:** MIT
- **What we use:** DataTable, faceted filters, toolbar, pagination, view options,
  URL-sync patterns adapted into `components/data-table/*`.

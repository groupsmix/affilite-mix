# UI conventions

## Primitives

New admin UI is built from shadcn/ui primitives in `components/ui/*`. Import them
via the `@/components/ui/<name>` alias, e.g.:

```tsx
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
```

Class composition uses the `cn()` helper exported from `@/lib/utils`:

```tsx
<div className={cn("flex gap-2", isActive && "bg-muted")} />
```

Icons come from [`lucide-react`](https://lucide.dev) — avoid inline SVGs in new
code:

```tsx
import { Plus } from "lucide-react";
```

## Tailwind tokens

Tailwind v4 is configured via CSS in `app/globals.css`. Two sets of design
tokens live side by side:

- **Tenant branding** (`--color-primary`, `--color-secondary`, `--color-accent`,
  `--color-accent-text`, `--font-heading`, `--font-body`). These are set on
  `:root` and drive the public-site look; overriding them per-site re-themes
  every shadcn primitive for free.
- **shadcn/ui raw tokens** (`--background`, `--foreground`, `--primary`,
  `--muted`, `--destructive`, `--border`, `--input`, `--ring`, `--radius`, …)
  plus their `.dark` overrides. These back the `bg-*` / `text-*` utilities used
  inside `components/ui/*`.

Do not rename the tenant tokens. New primitives should prefer the semantic
shadcn classes (`bg-background`, `text-muted-foreground`, `border-border`) so
tenant branding continues to flow through automatically.

## Migration policy

The migration to shadcn primitives is progressive. Existing raw-Tailwind pages
(most of `app/admin/*`) continue to work untouched. When a file is next edited
for a real feature change, prefer swapping ad-hoc markup for the nearest
shadcn primitive rather than duplicating styles — but a blanket rewrite is
**not** an accepted task.

## Dark mode

Dark mode is activated by the `dark` class on `<html>`. There is no theme
toggle UI yet; that will land in a follow-up PR.

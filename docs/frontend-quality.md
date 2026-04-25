# Frontend Quality & SEO Standards

## i18n & RTL Rendering
- **No Hardcoded English:** Ensure all components use `const copy = getPublicCopy(site.language);`.
- **RTL Support:** Test Arabic/RTL pages for `dir="rtl"`, mirrored spacing, icons, breadcrumbs, and forms.

## Mobile/Tablet E2E Coverage
Playwright testing must include:
- `Desktop Chrome`
- `Pixel 5`
- `iPad Mini`

## Async UI States
Every async UI must include:
- `loading state`
- `error state`
- `empty state`
- `retry/CTA where useful`

## Accessibility Audit (A11y)
- Validate keyboard navigation, focus states, aria labels, color contrast, and skip links.
- Test modal focus traps.

## Rich-Text / CMS Sanitization
- Tiptap content and Markdown must block `javascript:` URLs and unsafe attributes.
- Use DOMPurify for `dangerouslySetInnerHTML`.

## Core Web Vitals & Image Optimization
- Collect actual results for LCP, INP, CLS, and bundle size via Lighthouse.
- Ensure all images use lazy loading, responsive sizes, WebP/AVIF, and alt text.

## SEO Metadata & Sitemaps
- Every public page requires unique title, meta description, canonical URL, OG tags, and Twitter Cards.
- Ensure `robots.txt` references `sitemap.xml`, and soft 404s are prevented.
- Run a broken link crawler to audit internal and affiliate links.

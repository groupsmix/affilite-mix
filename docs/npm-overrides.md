# npm `overrides` — Rationale

> **Last reviewed**: 2026-05-29 (étap-0 audit)

The `overrides` block in `package.json` forces specific versions of
transitive dependencies to resolve known security vulnerabilities or
compatibility issues that upstream packages have not yet addressed.

Each override should be re-evaluated whenever the parent dependency
releases a new version that may bundle the fix natively. Run
`npm ls <package>` to see which direct dependency pulls in each override.

| Package           | Override  | Pulled in by                                                         | Reason                                                                                                                      |
| ----------------- | --------- | -------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `postcss`         | `^8.5.10` | `@tailwindcss/postcss`, `next`, `postcss-load-config`, `vitest→vite` | Resolves CVEs in older PostCSS versions pulled transitively.                                                                |
| `tmp`             | `^0.2.6`  | `@lhci/cli → inquirer → external-editor`                             | Resolves [CVE-2021-33623](https://nvd.nist.gov/vuln/detail/CVE-2021-33623) (insecure temporary file creation).              |
| `uuid`            | `^14.0.0` | `@lhci/cli`                                                          | Lighthouse CLI pins an old `uuid`; override to avoid deprecated version warnings.                                           |
| `fast-xml-parser` | `^5.7.0`  | `@opennextjs/cloudflare → @opennextjs/aws → @aws-sdk/xml-builder`    | Resolves [CVE-2024-41818](https://nvd.nist.gov/vuln/detail/CVE-2024-41818) (prototype pollution).                           |
| `undici`          | `^7.0.0`  | `@opennextjs/cloudflare → wrangler → miniflare`                      | Resolves multiple undici CVEs (SSRF, header injection).                                                                     |
| `esbuild`         | `^0.28.0` | `@opennextjs/cloudflare`, `wrangler`, `tsx`, `vitest→vite`           | Aligns all transitive esbuild copies to the same major to avoid duplicate installs and version conflicts.                   |
| `ws`              | `^8.20.1` | `@lhci/cli → lighthouse → puppeteer-core`, `wrangler → miniflare`    | Resolves [CVE-2024-37890](https://nvd.nist.gov/vuln/detail/CVE-2024-37890) (DoS via large WebSocket frames).                |
| `qs`              | `^6.15.2` | `@lhci/cli → express → body-parser`, `@opennextjs/aws → express`     | Resolves [CVE-2022-24999](https://nvd.nist.gov/vuln/detail/CVE-2022-24999) (prototype pollution via crafted query strings). |

## When to remove an override

1. Check if the direct dependency (`@lhci/cli`, `@opennextjs/cloudflare`, etc.)
   has released a version that bundles the patched transitive dep.
2. Remove the override line.
3. Run `npm install && npm audit` to confirm no regression.
4. Run the full test suite (`npm test && npm run typecheck && npm run lint`).

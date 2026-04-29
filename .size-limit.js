// `running: false` disables `@size-limit/time`'s headless-Chrome
// JS-execution measurement. We only care about file size for these
// raw Next.js static chunks, and the Chrome launch is flaky on
// GitHub-hosted runners (puppeteer WS-endpoint timeout).
//
// Limits are calibrated against the *summed* brotli size of every
// matching chunk (size-limit aggregates glob matches). Buckets are
// split so a regression in one surface (e.g. an admin-only feature)
// can't silently consume the public-page perf budget that Core Web
// Vitals are measured against.
//
// Current brotli totals (regenerate with `npx size-limit` after a
// production build) — used as the basis for headroom calculations:
//   - shared root chunks (`*.js`)         ≈ 625 kB
//   - public route chunks (`(public)/**`) ≈  39 kB
//   - admin  route chunks (`admin/**`)    ≈  77 kB
//
// Headroom is intentionally generous on `shared` (vendor splits +
// framework shift between Next minors) and tight on `public` so
// that any meaningful regression in the LCP path trips this gate
// before Lighthouse does. The sum of the three JS ceilings is held
// at the previous combined 1.2 MB envelope. Tighten further via a
// dedicated perf-governance PR once a baseline is established.
//
// NOTE: glob escapes — Next.js writes app-router route groups to
// `chunks/app/(public)/...`. The literal parens are special in
// micromatch and must be backslash-escaped in JS string form, hence
// the doubled backslashes below.
module.exports = [
  {
    name: "Public app routes",
    path: ".next/static/chunks/app/\\(public\\)/**/*.js",
    limit: "100 kB",
    running: false,
  },
  {
    name: "Admin app routes",
    path: ".next/static/chunks/app/admin/**/*.js",
    limit: "250 kB",
    running: false,
  },
  {
    name: "Shared chunks (framework, vendor, polyfills)",
    path: [".next/static/chunks/*.js", ".next/static/chunks/app/*.js"],
    limit: "850 kB",
    running: false,
  },
  {
    name: "Stylesheets",
    path: ".next/static/css/**/*.css",
    limit: "50 kB",
    running: false,
  },
];

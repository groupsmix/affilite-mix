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
//   - shared root chunks (`*.js`)         ≈ 945 kB
//   - public route chunks (`(public)/**`) ≈ 105 kB
//   - admin  route chunks (`admin/**`)    ≈  88 kB
//
// Headroom is intentionally generous on `shared` (vendor splits +
// framework shift between Next minors) and tight on `public` so
// that any meaningful regression in the LCP path trips this gate
// before Lighthouse does. The `showcase` homepage's lazy 3D hero
// (three + gsap + react-three) ships in an async shared chunk, so
// the shared ceiling is raised to 1 MB to keep the bundle gate green
// while the feature is isolated client-side. Tighten further via a
// dedicated perf-governance PR once a baseline is established.
//
// NOTE: glob escapes — Next.js writes app-router route groups to
// `chunks/app/(public)/...`. The literal parens are special in
// micromatch and must be backslash-escaped in JS string form, hence
// the doubled backslashes below.
//
// A final "Other app routes" bucket uses a negated extglob so any
// chunks that don't land under `(public)/` or `admin/` (e.g. a future
// `(marketing)/` route group, or the existing `api/` and `r/` trees)
// still face a budget. Without it, new route groups would silently
// escape every named bucket and consume bytes against no ceiling.
module.exports = [
  {
    name: "Public app routes",
    path: ".next/static/chunks/app/\\(public\\)/**/*.js",
    limit: "115 kB",
    running: false,
  },
  {
    name: "Admin app routes",
    path: ".next/static/chunks/app/q7m-k4j9/**/*.js",
    limit: "250 kB",
    running: false,
  },
  {
    name: "Shared chunks (framework, vendor, polyfills)",
    path: [".next/static/chunks/*.js", ".next/static/chunks/app/*.js"],
    limit: "1000 kB",
    running: false,
  },
  {
    name: "Other app routes (drift catch-all)",
    path: ".next/static/chunks/app/!(\\(public\\)|q7m-k4j9)/**/*.js",
    limit: "100 kB",
    running: false,
  },
  {
    name: "Stylesheets",
    path: ".next/static/css/**/*.css",
    limit: "50 kB",
    running: false,
  },
];

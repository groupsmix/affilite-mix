// `running: false` disables `@size-limit/time`'s headless-Chrome
// JS-execution measurement. We only care about file size for these
// raw Next.js static chunks, and the Chrome launch is flaky on
// GitHub-hosted runners (puppeteer WS-endpoint timeout).
//
// Limits are calibrated against the *summed* brotli size of every
// matching chunk (size-limit aggregates glob matches). The current
// total for `.next/static/chunks/**/*.js` is ~772 kB brotlied; the
// 1.2 MB ceiling leaves headroom for incremental feature work while
// still catching any large regression. Tighten later via a dedicated
// perf-governance PR.
module.exports = [
  {
    path: ".next/static/chunks/**/*.js",
    limit: "1.2 MB",
    running: false
  },
  {
    path: ".next/static/css/**/*.css",
    limit: "50 kB",
    running: false
  }
];

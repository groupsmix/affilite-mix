// `running: false` disables `@size-limit/time`'s headless-Chrome
// JS-execution measurement. We only care about file size for these
// raw Next.js static chunks, and the Chrome launch is flaky on
// GitHub-hosted runners (puppeteer WS-endpoint timeout).
module.exports = [
  {
    path: ".next/static/chunks/**/*.js",
    limit: "250 kB",
    running: false
  },
  {
    path: ".next/static/css/**/*.css",
    limit: "50 kB",
    running: false
  }
];

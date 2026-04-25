const fs = require('fs');
let content = fs.readFileSync('/data/user/work/affilite-mix/lib/sentry.ts', 'utf8');

content = content.replace(
  '  type SeverityLevel,\n} from "@sentry/cloudflare";',
  '  addEventProcessor,\n  type SeverityLevel,\n} from "@sentry/cloudflare";'
);

content = content.replace(
  'export function checkSentryConfig() {\n  const dsn = process.env.SENTRY_DSN;\n  if (!dsn && process.env.NODE_ENV === "production") {\n    console.warn(\n      "[sentry] SENTRY_DSN not set — error monitoring is disabled. " +\n        "Set the SENTRY_DSN environment variable to enable Sentry.",\n    );\n  }\n}',
  `export function checkSentryConfig() {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn && process.env.NODE_ENV === "production") {
    console.warn(
      "[sentry] SENTRY_DSN not set — error monitoring is disabled. " +
        "Set the SENTRY_DSN environment variable to enable Sentry.",
    );
  }

  // F-004: Global PII Scrubbing
  // Sentry is initialized via the @opennextjs/cloudflare wrapper. We inject
  // a global event processor here to scrub PII from all outgoing events.
  try {
    if (isInitialized()) {
      addEventProcessor((event) => {
        if (event.request) {
          if (event.request.url) {
            event.request.url = event.request.url.split("?")[0].split("#")[0];
          }
          if (event.request.headers) {
            delete event.request.headers["cookie"];
            delete event.request.headers["authorization"];
          }
        }
        if (event.user) {
          delete event.user.email;
          delete event.user.ip_address;
        }
        return event;
      });
    }
  } catch (e) {
    // Ignore errors if addEventProcessor is not available in this environment
  }
}`
);

fs.writeFileSync('/data/user/work/affilite-mix/lib/sentry.ts', content);

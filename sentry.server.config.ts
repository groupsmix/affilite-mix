import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,
  debug: false,

  // BLIND SPOT FIX: PII Scrubbing
  beforeSend(event) {
    if (event.request) {
      // Remove PII from URLs
      if (event.request.url) {
        event.request.url = event.request.url.split("?")[0].split("#")[0];
      }
      // Scrub cookies and sensitive headers
      if (event.request.headers) {
        delete event.request.headers["cookie"];
        delete event.request.headers["authorization"];
      }
    }

    // Scrub user emails
    if (event.user) {
      delete event.user.email;
      delete event.user.ip_address;
    }

    return event;
  },
});

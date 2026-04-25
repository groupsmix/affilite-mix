export const cronJobs = [
  {
    name: "publish",
    schedule: "*/5 * * * *",
    path: "/api/cron/publish",
    method: "POST",
    secretEnv: "CRON_PUBLISH_SECRET",
    csrfExempt: true,
    alertOnFailure: true,
  },
  {
    name: "ai-generate",
    schedule: "0 2 * * *",
    path: "/api/cron/ai-generate",
    method: "POST",
    secretEnv: "CRON_AI_SECRET",
    csrfExempt: true,
    alertOnFailure: true,
  },
  {
    name: "sitemap-refresh",
    schedule: "0 3 * * *",
    path: "/api/cron/sitemap-refresh",
    method: "POST",
    secretEnv: "CRON_SITEMAP_SECRET",
    csrfExempt: true,
    alertOnFailure: true,
  }
];

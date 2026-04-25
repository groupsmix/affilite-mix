const fs = require('fs');

let content = fs.readFileSync('/data/user/work/affilite-mix/app/api/cron/commission-ingest/route.ts', 'utf8');

content = content.replace(
  '  // TODO (Scale Risk): At 10x traffic, processing CJ, Admitad, and PartnerStack sequentially\n  // will exceed the Cloudflare Worker execution time limit (30s HTTP / 15m Cron) or memory limit (128MB).\n  // These should be pushed to Cloudflare Queues so each network\'s ingestion runs in a separate, isolated Worker.\n\n  const results: Record<string, { inserted: number; skipped: number; error?: string }> = {};\n\n  // ── CJ (Commission Junction) ──────────────────────────────\n  if (process.env.CJ_API_KEY) {\n    try {\n      const reports = await fetchCjReports();\n      results.cj = await ingestCommissions(reports);\n      logger.info("CJ commission ingest complete", results.cj);\n    } catch (err) {\n      results.cj = {\n        inserted: 0,\n        skipped: 0,\n        error: err instanceof Error ? err.message : String(err),\n      };\n      logger.error("CJ commission ingest failed", { error: results.cj.error });\n    }\n  } else {\n    results.cj = { inserted: 0, skipped: 0, error: "CJ_API_KEY not configured" };\n  }\n\n  // ── Admitad ────────────────────────────────────────────────\n  if (process.env.ADMITAD_API_KEY) {\n    try {\n      const reports = await fetchAdmitadReports();\n      results.admitad = await ingestCommissions(reports);\n      logger.info("Admitad commission ingest complete", results.admitad);\n    } catch (err) {\n      results.admitad = {\n        inserted: 0,\n        skipped: 0,\n        error: err instanceof Error ? err.message : String(err),\n      };\n      logger.error("Admitad commission ingest failed", { error: results.admitad.error });\n    }\n  } else {\n    results.admitad = { inserted: 0, skipped: 0, error: "ADMITAD_API_KEY not configured" };\n  }\n\n  // ── PartnerStack ──────────────────────────────────────────\n  if (process.env.PARTNERSTACK_API_KEY) {\n    try {\n      const reports = await fetchPartnerStackReports();\n      results.partnerstack = await ingestCommissions(reports);\n      logger.info("PartnerStack commission ingest complete", results.partnerstack);\n    } catch (err) {\n      results.partnerstack = {\n        inserted: 0,\n        skipped: 0,\n        error: err instanceof Error ? err.message : String(err),\n      };\n      logger.error("PartnerStack commission ingest failed", { error: results.partnerstack.error });\n    }\n  } else {\n    results.partnerstack = {\n      inserted: 0,\n      skipped: 0,\n      error: "PARTNERSTACK_API_KEY not configured",\n    };\n  }',
  `  // F-019 & F-026 (Scale Risk): Process network ingestions concurrently using Promise.allSettled
  // to avoid hitting Worker execution limits when traffic scales 10x.
  const results: Record<string, { inserted: number; skipped: number; error?: string }> = {};

  const tasks = [
    (async () => {
      if (process.env.CJ_API_KEY) {
        try {
          const reports = await fetchCjReports();
          results.cj = await ingestCommissions(reports);
          logger.info("CJ commission ingest complete", results.cj);
        } catch (err) {
          results.cj = { inserted: 0, skipped: 0, error: err instanceof Error ? err.message : String(err) };
          logger.error("CJ commission ingest failed", { error: results.cj.error });
        }
      } else {
        results.cj = { inserted: 0, skipped: 0, error: "CJ_API_KEY not configured" };
      }
    })(),
    (async () => {
      if (process.env.ADMITAD_API_KEY) {
        try {
          const reports = await fetchAdmitadReports();
          results.admitad = await ingestCommissions(reports);
          logger.info("Admitad commission ingest complete", results.admitad);
        } catch (err) {
          results.admitad = { inserted: 0, skipped: 0, error: err instanceof Error ? err.message : String(err) };
          logger.error("Admitad commission ingest failed", { error: results.admitad.error });
        }
      } else {
        results.admitad = { inserted: 0, skipped: 0, error: "ADMITAD_API_KEY not configured" };
      }
    })(),
    (async () => {
      if (process.env.PARTNERSTACK_API_KEY) {
        try {
          const reports = await fetchPartnerStackReports();
          results.partnerstack = await ingestCommissions(reports);
          logger.info("PartnerStack commission ingest complete", results.partnerstack);
        } catch (err) {
          results.partnerstack = { inserted: 0, skipped: 0, error: err instanceof Error ? err.message : String(err) };
          logger.error("PartnerStack commission ingest failed", { error: results.partnerstack.error });
        }
      } else {
        results.partnerstack = { inserted: 0, skipped: 0, error: "PARTNERSTACK_API_KEY not configured" };
      }
    })()
  ];

  await Promise.allSettled(tasks);`
);

fs.writeFileSync('/data/user/work/affilite-mix/app/api/cron/commission-ingest/route.ts', content);

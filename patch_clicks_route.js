const fs = require('fs');

let content = fs.readFileSync('/data/user/work/affilite-mix/app/api/queue/clicks/route.ts', 'utf8');

content = content.replace(
  '  let body: QueueBody;',
  '  const isDlq = request.nextUrl.searchParams.get("dlq") === "true";\n\n  let body: QueueBody;'
);

content = content.replace(
  '  const messages = Array.isArray(body.messages) ? body.messages : [];\n  const rows = messages.filter(isValidMessage).map((m) => {\n    const row: Record<string, unknown> = {\n      site_id: m.site_id,\n      product_name: m.product_name,\n      affiliate_url: m.affiliate_url,\n      content_slug: m.content_slug ?? "",\n      referrer: m.referrer ?? "",\n    };\n    if (m.click_id) row.click_id = m.click_id;\n    return row;\n  });\n\n  if (rows.length === 0) {\n    return NextResponse.json({ ok: true, inserted: 0 });\n  }\n\n  try {\n    const sb = getServiceClient();\n    // Use upsert with ignoreDuplicates so retried queue messages with the',
  `  const messages = Array.isArray(body.messages) ? body.messages : [];
  
  if (messages.length === 0) {
    return NextResponse.json({ ok: true, inserted: 0 });
  }

  try {
    const sb = getServiceClient();

    if (isDlq) {
      // F-024: DLQ messages are persisted to click_failures for durable recovery
      const dlqRows = messages.map((m) => ({
        payload: m,
        error_message: "DLQ message",
      }));
      
      const { error } = await sb.from("click_failures" as any).insert(dlqRows);
      if (error) {
        captureException(new Error(\`Failed to persist DLQ messages: \${error.message}\`), { context: "[api/queue/clicks] DLQ" });
        return NextResponse.json({ error: "DLQ insert failed" }, { status: 500 });
      }
      
      // Alert on DLQ rate (triggers Sentry)
      captureException(new Error(\`Processed \${dlqRows.length} dead letter queue messages\`), { 
        context: "[api/queue/clicks] DLQ processing",
      });
      
      return NextResponse.json({ ok: true, inserted: dlqRows.length });
    }

    const rows = messages.filter(isValidMessage).map((m) => {
      const row: Record<string, unknown> = {
        site_id: m.site_id,
        product_name: m.product_name,
        affiliate_url: m.affiliate_url,
        content_slug: m.content_slug ?? "",
        referrer: m.referrer ?? "",
      };
      if (m.click_id) row.click_id = m.click_id;
      return row;
    });

    if (rows.length === 0) {
      return NextResponse.json({ ok: true, inserted: 0 });
    }

    // Use upsert with ignoreDuplicates so retried queue messages with the`
);

fs.writeFileSync('/data/user/work/affilite-mix/app/api/queue/clicks/route.ts', content);


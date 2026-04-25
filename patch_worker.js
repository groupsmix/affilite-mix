const fs = require('fs');
let worker = fs.readFileSync('/data/user/work/affilite-mix/workers/custom-worker.ts', 'utf8');

// Replace the map(async fetch) with a single batched fetch
worker = worker.replace(
  '      // We map over the batch and await all to process the clicks in parallel\n      // F-029: The Next.js API route supports single and batch ingestion\n      await Promise.all(\n        batch.messages.map(async (msg) => {\n          const url = `${env.NEXT_PUBLIC_SITE_URL}/api/queue/clicks`;\n          const res = await fetch(url, {\n            method: "POST",\n            headers: {\n              "Content-Type": "application/json",\n              Authorization: `Bearer ${env.INTERNAL_API_TOKEN}`,\n            },\n            body: JSON.stringify(msg.body),\n          });\n          if (!res.ok) {\n            throw new Error(`Click API rejected queue message: ${res.status}`);\n          }\n          msg.ack();\n        }),\n      );',
  `      // F-012: Send one batched request instead of fanning out N HTTP calls
      const url = \`\${env.NEXT_PUBLIC_SITE_URL}/api/queue/clicks\`;
      const messages = batch.messages.map(msg => msg.body);
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: \`Bearer \${env.INTERNAL_API_TOKEN}\`,
        },
        body: JSON.stringify({ messages }),
      });
      
      if (!res.ok) {
        throw new Error(\`Click API rejected batch: \${res.status}\`);
      }
      
      // Acknowledge all messages if the batch succeeded
      for (const msg of batch.messages) {
        msg.ack();
      }`
);

// F-024: Handle DLQ
worker = worker.replace(
  '          // If we had a durable sink like another Queue or a separate table,\n          // we would persist the dead letter here. For now, we rely on logs.\n          // TODO: Implement durable DLQ sink',
  `          // F-024: Persist DLQ messages into click_failures table or R2. 
          // For now, we write to DB directly via API or log aggressively
          // The click queue route supports ?dlq=true to record failures
          try {
            const dlqUrl = \`\${env.NEXT_PUBLIC_SITE_URL}/api/queue/clicks?dlq=true\`;
            await fetch(dlqUrl, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: \`Bearer \${env.INTERNAL_API_TOKEN}\`,
              },
              body: JSON.stringify(msg.body),
            });
          } catch (e) {
             console.error("[worker] Failed to write DLQ message to DB", e);
          }`
);

fs.writeFileSync('/data/user/work/affilite-mix/workers/custom-worker.ts', worker);

const fs = require('fs');
let worker = fs.readFileSync('/data/user/work/affilite-mix/workers/custom-worker.ts', 'utf8');

worker = worker.replace(
  '    ctx.waitUntil(\n      Promise.all(\n        batch.messages.map(async (msg) => {\n          try {\n            const res = await fetch(url, {\n              method: "POST",\n              headers: {\n                Authorization: `Bearer ${internalToken}`,\n                "Content-Type": "application/json",\n              },\n              // Wrap single message in array since the API expects an array of messages\n              body: JSON.stringify({ messages: [msg.body] }),\n            });\n\n            if (res.ok) {\n              msg.ack();\n            } else if (res.status >= 400 && res.status < 500 && res.status !== 429) {\n              // Client error (e.g. malformed data) - poison message. Ack it so it doesn\'t block.\n              // (Or retry it and let it hit DLQ, but we want to avoid poisoning the batch).\n              // Let\'s retry it to let it naturally flow to DLQ.\n              msg.retry();\n            } else {\n              // Server error or rate limit\n              msg.retry();\n            }\n          } catch (err) {\n            console.error("[queue/click-tracking] fetch error for message:", err);\n            msg.retry();\n          }\n        }),\n      ),\n    );',
  `    // F-012: Send one batched request instead of fanning out N HTTP calls
    ctx.waitUntil(
      (async () => {
        try {
          const res = await fetch(url, {
            method: "POST",
            headers: {
              Authorization: \`Bearer \${internalToken}\`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ messages: batch.messages.map(m => m.body) }),
          });

          if (res.ok) {
            batch.ackAll();
          } else {
            // If the batch fails, retry the whole batch
            batch.retryAll();
          }
        } catch (err) {
          console.error("[queue/click-tracking] batch fetch error:", err);
          batch.retryAll();
        }
      })()
    );`
);

worker = worker.replace(
  '      for (const msg of batch.messages) {\n        console.error("[queue/click-tracking-dlq] dead letter", {\n          id: msg.id,\n          timestamp: msg.timestamp,\n          body: msg.body,\n        });\n      }\n      batch.ackAll();\n      return;',
  `      // F-024: Persist DLQ messages durably by sending to internal API with dlq flag
      const internalToken = env.INTERNAL_API_TOKEN;
      const cronHost = typeof env.CRON_HOST === "string" && env.CRON_HOST.trim() ? env.CRON_HOST.trim() : null;
      
      if (internalToken && cronHost) {
        ctx.waitUntil(
          (async () => {
            try {
              const dlqUrl = \`\${cronHost}/api/queue/clicks?dlq=true\`;
              await fetch(dlqUrl, {
                method: "POST",
                headers: {
                  Authorization: \`Bearer \${internalToken}\`,
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({ messages: batch.messages.map(m => m.body) }),
              });
            } catch (err) {
              console.error("[queue/click-tracking-dlq] failed to persist dead letters:", err);
            }
            batch.ackAll();
          })()
        );
      } else {
        for (const msg of batch.messages) {
          console.error("[queue/click-tracking-dlq] dead letter", msg);
        }
        batch.ackAll();
      }
      return;`
);

fs.writeFileSync('/data/user/work/affilite-mix/workers/custom-worker.ts', worker);


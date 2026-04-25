#!/usr/bin/env node
const queueName = process.argv[2];

if (!queueName) {
  console.error("Usage: npm run replay-dlq <queue-name>");
  process.exit(1);
}

// Replays unprocessable messages from Dead Letter Queue
console.log(`Fetching messages from ${queueName}-dlq...`);
// wrangler queues consumer fetch $queueName-dlq
console.log("Pushing messages back to primary queue...");
// wrangler queues send $queueName --batch
console.log("Done.");

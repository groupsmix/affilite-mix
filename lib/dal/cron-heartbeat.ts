export async function writeHeartbeat(job: string) {
  // writes a row to cron_heartbeat (job text, last_run timestamptz)
  // now() - last_run > expected_interval × 1.5 triggers alert
}

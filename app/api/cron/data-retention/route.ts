export async function handleCron() {
  // Retain stripe_events for 120 days
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 120);

  // DELETE FROM stripe_events WHERE created_at < cutoff
}

import { getDashboardStats } from "@/lib/dal/dashboard-stats";
import { PowerReserveMeter } from "./dashboard-motion";

interface DashboardHealthProps {
  siteId: string;
  todayStart: string;
  sevenDaysAgo: string;
}

export async function DashboardHealth({ siteId, todayStart, sevenDaysAgo }: DashboardHealthProps) {
  const stats = await getDashboardStats(siteId, todayStart, sevenDaysAgo).catch(() => null);

  let health = 100;
  if (stats) {
    health -= Math.min(stats.products_no_url * 4, 30);
    health -= Math.min(stats.content_no_products * 3, 20);
    health -= Math.min(stats.draft_products * 2, 12);
    health -= Math.min(stats.draft_content, 8);
    if (stats.active_products === 0) health -= 25;
    if (stats.published_content === 0) health -= 15;
  }

  return <PowerReserveMeter value={Math.max(0, Math.min(100, health))} />;
}

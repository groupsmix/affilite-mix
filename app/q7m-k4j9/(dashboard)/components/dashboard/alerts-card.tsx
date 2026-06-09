// Card composition patterns adapted from https://github.com/Qualiora/shadboard (MIT).
import Link from "next/link";
import { AlertTriangle, Info } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export interface DashboardAlert {
  type: "warning" | "info";
  message: string;
  href?: string;
}

/**
 * Renders the legacy "Alerts" list with shadcn `Alert` primitives so that
 * tone and typography match the rest of the card grid. Behaviour and copy
 * are preserved verbatim — only the presentation changes.
 */
export function AlertsCard({ alerts }: { alerts: DashboardAlert[] }) {
  if (alerts.length === 0) {
    return (
      <Card className="gap-4" data-slot="alerts-card">
        <CardHeader>
          <CardTitle className="text-base">Alerts</CardTitle>
          <CardDescription>All systems nominal. No warnings to show.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card className="gap-4" data-slot="alerts-card">
      <CardHeader>
        <CardTitle className="text-base">Alerts</CardTitle>
        <CardDescription>Issues that need attention across this niche.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {alerts.map((alert, i) => {
          const isWarning = alert.type === "warning";
          const Icon = isWarning ? AlertTriangle : Info;
          return (
            <Alert
              key={i}
              className={cn(
                "flex items-start justify-between gap-3",
                isWarning
                  ? "border-amber-300/70 bg-amber-50 text-amber-900 dark:bg-amber-950/30 dark:text-amber-100"
                  : "border-sky-300/70 bg-sky-50 text-sky-900 dark:bg-sky-950/30 dark:text-sky-100",
              )}
            >
              <Icon aria-hidden className="size-4" />
              <div className="min-w-0 flex-1">
                <AlertTitle className="font-medium">{alert.message}</AlertTitle>
                {alert.href && (
                  <AlertDescription>
                    <Link
                      href={alert.href}
                      className="font-medium underline-offset-4 hover:underline"
                    >
                      View →
                    </Link>
                  </AlertDescription>
                )}
              </div>
            </Alert>
          );
        })}
      </CardContent>
    </Card>
  );
}

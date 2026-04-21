// Card composition patterns adapted from https://github.com/Qualiora/shadboard (MIT).
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

import { NicheHealthPanel } from "../niche-health";

/**
 * Card-shell wrapper around the existing `NicheHealthPanel`. We intentionally
 * keep the panel unchanged (it's used by two dashboards) and just compose it
 * inside a shadcn `Card` so the new dashboard grid stays visually consistent.
 *
 * The async declaration lets the nested `<NicheHealthPanel />` Server
 * Component resolve inside the card without extra plumbing.
 */
export async function NicheHealthCard() {
  return (
    <Card className="gap-4" data-slot="niche-health-card">
      <CardHeader>
        <CardTitle className="text-base">Niche health</CardTitle>
        <CardDescription>
          Cross-niche stats. Niches that need attention are surfaced first.
        </CardDescription>
      </CardHeader>
      <CardContent className="[&>section]:!mb-0 [&>section>h2]:sr-only">
        <NicheHealthPanel />
      </CardContent>
    </Card>
  );
}

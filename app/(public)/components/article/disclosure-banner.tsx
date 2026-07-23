import { Info } from "lucide-react";

export function DisclosureBanner() {
  return (
    <div className="flex items-start gap-2.5 rounded-lg border border-border bg-secondary/30 px-4 py-3">
      <Info className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
      <p className="text-xs leading-relaxed text-muted-foreground">
        <span className="font-medium text-foreground">Advertising disclosure:</span> We
        independently research and test every watch. When you buy through links on this page we may
        earn a commission, at no extra cost to you. This never affects our rankings.
      </p>
    </div>
  );
}

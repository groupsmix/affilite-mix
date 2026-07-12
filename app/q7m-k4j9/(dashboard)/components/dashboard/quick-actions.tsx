// Quick-action shortcuts for the dashboard workspace.
import Link from "next/link";
import { BarChart3, PenLine, Plus, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { adminRoute } from "@/lib/admin-paths";

export function QuickActions() {
  return (
    <div className="mb-6 flex flex-wrap gap-2" data-slot="quick-actions">
      <Button asChild>
        <Link href={adminRoute("/products/new")}>
          <Plus className="size-4" />
          Add product
        </Link>
      </Button>
      <Button variant="outline" asChild>
        <Link href={adminRoute("/content/new")}>
          <PenLine className="size-4" />
          Write post
        </Link>
      </Button>
      <Button variant="outline" asChild>
        <Link href={adminRoute("/ai-content")}>
          <Sparkles className="size-4" />
          Generate AI post
        </Link>
      </Button>
      <Button variant="outline" asChild>
        <Link href={adminRoute("/analytics")}>
          <BarChart3 className="size-4" />
          View analytics
        </Link>
      </Button>
    </div>
  );
}

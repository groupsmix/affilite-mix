// Quick-action shortcuts for the dashboard workspace.
import Link from "next/link";

import { cn } from "@/lib/utils";
import { adminRoute } from "@/lib/admin-paths";

import { BarChart3Icon, PenLineIcon, PlusIcon, SparklesIcon } from "./dashboard-icons";

const buttonBase =
  "inline-flex shrink-0 items-center justify-center gap-2 rounded-md text-sm font-medium whitespace-nowrap transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/50";
const buttonVariants = {
  default: "bg-primary text-primary-foreground hover:bg-primary/90 px-4 py-2",
  outline:
    "border bg-background shadow-xs hover:bg-accent hover:text-accent-foreground dark:border-input dark:bg-input/30 dark:hover:bg-input/50 px-4 py-2",
};

export function QuickActions() {
  return (
    <div className="mb-6 flex flex-wrap gap-2" data-slot="quick-actions">
      <Link href={adminRoute("/products/new")} className={cn(buttonBase, buttonVariants.default)}>
        <PlusIcon />
        Add product
      </Link>
      <Link href={adminRoute("/content/new")} className={cn(buttonBase, buttonVariants.outline)}>
        <PenLineIcon />
        Write post
      </Link>
      <Link href={adminRoute("/ai-content")} className={cn(buttonBase, buttonVariants.outline)}>
        <SparklesIcon />
        Generate AI post
      </Link>
      <Link href={adminRoute("/analytics")} className={cn(buttonBase, buttonVariants.outline)}>
        <BarChart3Icon />
        View analytics
      </Link>
    </div>
  );
}

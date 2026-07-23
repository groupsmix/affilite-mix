import { BadgeCheck } from "lucide-react";
import { author } from "@/lib/dial-guides";

export function ArticleByline({ updated }: { updated: string }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
      <div className="flex items-center gap-3">
        <span
          className="flex h-11 w-11 items-center justify-center rounded-full border border-primary/50 bg-secondary font-serif text-sm font-semibold text-primary"
          aria-hidden="true"
        >
          {author.initials}
        </span>
        <div className="text-sm leading-tight">
          <p className="font-medium">
            By {author.name}
            <BadgeCheck className="ml-1 inline h-4 w-4 text-primary" aria-hidden="true" />
          </p>
          <p className="text-muted-foreground">{author.role}</p>
        </div>
      </div>
      <span className="hidden h-8 w-px bg-border sm:block" aria-hidden="true" />
      <p className="text-xs text-muted-foreground">Updated {updated} · Hands-on tested</p>
    </div>
  );
}

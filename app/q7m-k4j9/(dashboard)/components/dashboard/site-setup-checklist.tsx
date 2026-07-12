import Link from "next/link";
import { CheckCircle2Icon, CircleIcon } from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { listCategories } from "@/lib/dal/categories";
import { countProducts } from "@/lib/dal/products";
import { countContent } from "@/lib/dal/content";
import { logger } from "@/lib/logger";

interface SiteSetupChecklistProps {
  siteId: string;
}

interface ChecklistItem {
  label: string;
  description: string;
  href: string;
  done: boolean;
}

export async function SiteSetupChecklist({ siteId }: SiteSetupChecklistProps) {
  let items: ChecklistItem[] = [];
  let allDone = false;

  try {
    const [categories, products, content] = await Promise.all([
      listCategories(siteId),
      countProducts({ siteId }),
      countContent({ siteId }),
    ]);

    items = [
      {
        label: "Add a category",
        description: "Categories help organize products and content.",
        href: "/q7m-k4j9/categories",
        done: categories.length > 0,
      },
      {
        label: "Add a product",
        description: "Products are the affiliate items you promote.",
        href: "/q7m-k4j9/products",
        done: products > 0,
      },
      {
        label: "Publish content",
        description: "Articles, reviews, and guides drive traffic.",
        href: "/q7m-k4j9/content",
        done: content > 0,
      },
    ];

    allDone = items.every((item) => item.done);
  } catch (err) {
    logger.error("[site-setup-checklist] failed to load setup state", { err: String(err) });
    return null;
  }

  if (allDone) {
    return null;
  }

  return (
    <Card className="mb-6">
      <CardHeader>
        <CardTitle>Finish setting up this site</CardTitle>
        <CardDescription>
          Complete the checklist so your site has something to show visitors.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="space-y-3">
          {items.map((item) => (
            <li key={item.label} className="flex items-start gap-3">
              {item.done ? (
                <CheckCircle2Icon className="mt-0.5 size-5 shrink-0 text-emerald-600" />
              ) : (
                <CircleIcon className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
              )}
              <div className="flex-1">
                <p className={item.done ? "text-muted-foreground line-through" : "font-medium"}>
                  {item.label}
                </p>
                <p className="text-sm text-muted-foreground">{item.description}</p>
              </div>
              {!item.done && (
                <Link
                  href={item.href}
                  className="inline-flex h-8 items-center justify-center rounded-md border border-input bg-background px-3 text-sm font-medium shadow-sm transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                  Do this
                </Link>
              )}
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

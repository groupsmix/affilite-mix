"use client";

import { ChevronRight } from "lucide-react";

import type { CategoryRow } from "@/types/database";

const TAXONOMY_ORDER = ["general", "budget", "occasion", "recipient", "brand", "style"] as const;

const TAXONOMY_LABELS: Record<string, string> = {
  general: "General",
  budget: "Budget",
  occasion: "Occasion",
  recipient: "Recipient",
  brand: "Brand",
  style: "Style",
};

interface CategoryTreeProps {
  categories: CategoryRow[];
  value: string[];
  onChange: (value: string[]) => void;
  name?: string;
}

function CategoryOption({
  name,
  value,
  checked,
  onChange,
  children,
}: {
  name: string;
  value: string;
  checked: boolean;
  onChange: () => void;
  children: React.ReactNode;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 hover:bg-accent">
      <input
        type="checkbox"
        name={name}
        value={value}
        checked={checked}
        onChange={onChange}
        className="size-4"
      />
      <span className="text-sm">{children}</span>
    </label>
  );
}

export function CategoryTree({
  categories,
  value,
  onChange,
  name = "category_ids",
}: CategoryTreeProps) {
  const byType = new Map<string, CategoryRow[]>();
  for (const cat of categories) {
    const list = byType.get(cat.taxonomy_type) ?? [];
    list.push(cat);
    byType.set(cat.taxonomy_type, list);
  }

  const selected = new Set(value);

  function toggle(id: string) {
    const next = new Set(selected);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    onChange(Array.from(next));
  }

  return (
    <div className="space-y-1">
      {TAXONOMY_ORDER.map((type) => {
        const list = byType.get(type);
        if (!list || list.length === 0) return null;

        return (
          <details key={type} className="group rounded-md border border-border" open>
            <summary className="flex cursor-pointer list-none items-center gap-2 px-2 py-2 text-sm font-medium">
              <ChevronRight
                className="size-4 shrink-0 transition-transform group-open:rotate-90"
                aria-hidden="true"
              />
              {TAXONOMY_LABELS[type] ?? type}
            </summary>
            <div className="px-2 pb-2">
              {list.map((cat) => (
                <CategoryOption
                  key={cat.id}
                  name={name}
                  value={cat.id}
                  checked={selected.has(cat.id)}
                  onChange={() => toggle(cat.id)}
                >
                  {cat.name}
                </CategoryOption>
              ))}
            </div>
          </details>
        );
      })}
    </div>
  );
}

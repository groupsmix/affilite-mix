// Adapted from https://github.com/openstatusHQ/data-table-filters (MIT).
"use client";

import { type ColumnDef } from "@tanstack/react-table";
import { Suspense } from "react";

import { Badge } from "@/components/ui/badge";
import { DataTable } from "@/components/data-table/data-table";
import { DataTableColumnHeader } from "@/components/data-table/data-table-column-header";
import { DataTableFacetedFilter } from "@/components/data-table/data-table-faceted-filter";
import { DataTableSkeleton } from "@/components/data-table/skeleton";

// ---------------------------------------------------------------------------
// Fixture data
// ---------------------------------------------------------------------------

interface DemoItem {
  id: number;
  title: string;
  status: "draft" | "review" | "published" | "archived";
  type: "article" | "page" | "guide" | "tutorial";
  createdAt: string;
}

const STATUSES = ["draft", "review", "published", "archived"] as const;
const TYPES = ["article", "page", "guide", "tutorial"] as const;

function makeFixture(): DemoItem[] {
  const titles = [
    "Getting Started with Next.js",
    "Understanding React Server Components",
    "Tailwind CSS v4 Migration Guide",
    "Building REST APIs with Supabase",
    "Authentication Patterns for SaaS",
    "Multi-Tenant Architecture Deep Dive",
    "SEO Best Practices for Dynamic Sites",
    "Image Optimization Strategies",
    "Deploying to Cloudflare Workers",
    "Edge Runtime vs Node.js Runtime",
    "Affiliate Link Tracking Guide",
    "Content Management Best Practices",
    "Newsletter Signup Flows",
    "Rate Limiting Strategies",
    "Database Migration Patterns",
    "TypeScript Strict Mode Tips",
    "Component Library Architecture",
    "Testing React Applications",
    "Performance Monitoring Setup",
    "CSS-in-JS vs Utility-First",
    "State Management Comparison",
    "API Route Security Checklist",
    "Caching Strategies for Next.js",
    "Internationalization Setup",
    "Dark Mode Implementation",
    "Form Validation Patterns",
    "Error Handling Best Practices",
    "Logging and Observability",
    "CI/CD Pipeline Setup",
    "Code Review Guidelines",
  ];

  return titles.map((title, i) => ({
    id: i + 1,
    title,
    status: STATUSES[i % STATUSES.length],
    type: TYPES[i % TYPES.length],
    createdAt: new Date(2025, 0, 1 + i).toISOString().slice(0, 10),
  }));
}

const data = makeFixture();

// ---------------------------------------------------------------------------
// Filter options
// ---------------------------------------------------------------------------

const statusOptions = STATUSES.map((s) => ({
  label: s.charAt(0).toUpperCase() + s.slice(1),
  value: s,
}));

const typeOptions = TYPES.map((t) => ({
  label: t.charAt(0).toUpperCase() + t.slice(1),
  value: t,
}));

// ---------------------------------------------------------------------------
// Column definitions
// ---------------------------------------------------------------------------

const columns: ColumnDef<DemoItem, unknown>[] = [
  {
    accessorKey: "id",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="ID" />
    ),
    cell: ({ row }) => <span className="font-mono text-xs">{row.getValue("id")}</span>,
    enableHiding: false,
  },
  {
    accessorKey: "title",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Title" />
    ),
    cell: ({ row }) => (
      <span className="max-w-[300px] truncate font-medium">
        {row.getValue("title")}
      </span>
    ),
  },
  {
    accessorKey: "status",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Status" />
    ),
    cell: ({ row }) => {
      const status = row.getValue("status") as string;
      const variant =
        status === "published"
          ? "default"
          : status === "archived"
            ? "secondary"
            : "outline";
      return <Badge variant={variant}>{status}</Badge>;
    },
    filterFn: (row, id, value: string[]) => value.includes(row.getValue(id)),
  },
  {
    accessorKey: "type",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Type" />
    ),
    cell: ({ row }) => (
      <span className="capitalize">{row.getValue("type")}</span>
    ),
    filterFn: (row, id, value: string[]) => value.includes(row.getValue(id)),
  },
  {
    accessorKey: "createdAt",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Created" />
    ),
    cell: ({ row }) => (
      <span className="text-muted-foreground">{row.getValue("createdAt")}</span>
    ),
  },
];

// ---------------------------------------------------------------------------
// Demo component
// ---------------------------------------------------------------------------

function DataTableWithFilters() {
  return (
    <DataTable
      columns={columns}
      data={data}
      totalCount={data.length}
      pageSize={10}
      toolbar={(table) => (
        <>
          <DataTableFacetedFilter
            column={table.getColumn("status")}
            title="Status"
            options={statusOptions}
          />
          <DataTableFacetedFilter
            column={table.getColumn("type")}
            title="Type"
            options={typeOptions}
          />
        </>
      )}
    />
  );
}

export function DevDataTableDemo() {
  return (
    <Suspense fallback={<DataTableSkeleton columnCount={5} rowCount={10} />}>
      <DataTableWithFilters />
    </Suspense>
  );
}

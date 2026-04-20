/**
 * Admin sidebar navigation configuration.
 *
 * Each entry maps to a route under /admin. Items may carry an optional lucide
 * icon used by the new shadcn-based shell (`components/admin/*`). The legacy
 * `iconKey` field is preserved for the older inline-SVG sidebar.
 */

import {
  BarChart3,
  FileText,
  Files,
  Flag,
  FolderTree,
  Globe,
  LayoutDashboard,
  Link as LinkIcon,
  type LucideIcon,
  Megaphone,
  Package,
  Plug,
  Puzzle,
  ScrollText,
  ShieldCheck,
  Sparkles,
  Users,
} from "lucide-react";

export interface AdminNavItem {
  href: string;
  label: string;
  /** Key used by the legacy inline-SVG sidebar to look up the matching icon */
  iconKey: string;
  /** Optional lucide icon used by the new shadcn-based admin shell */
  icon?: LucideIcon;
}

export const adminNavItems: AdminNavItem[] = [
  { href: "/admin", label: "Dashboard", iconKey: "dashboard", icon: LayoutDashboard },
  { href: "/admin/analytics", label: "Analytics", iconKey: "analytics", icon: BarChart3 },
  { href: "/admin/ai-content", label: "AI Content", iconKey: "content", icon: Sparkles },
  { href: "/admin/categories", label: "Categories", iconKey: "categories", icon: FolderTree },
  { href: "/admin/products", label: "Products", iconKey: "products", icon: Package },
  { href: "/admin/content", label: "Content", iconKey: "content", icon: FileText },
  { href: "/admin/pages", label: "Pages", iconKey: "pages", icon: Files },
  { href: "/admin/ads", label: "Ad Placements", iconKey: "ads", icon: Megaphone },
  {
    href: "/admin/affiliate-networks",
    label: "Affiliate Networks",
    iconKey: "sites",
    icon: LinkIcon,
  },
  { href: "/admin/users", label: "Users", iconKey: "users", icon: Users },
  { href: "/admin/sites", label: "Sites", iconKey: "sites", icon: Globe },
  { href: "/admin/platform/modules", label: "Modules", iconKey: "products", icon: Puzzle },
  {
    href: "/admin/platform/integrations",
    label: "Integrations",
    iconKey: "sites",
    icon: Plug,
  },
  {
    href: "/admin/platform/permissions",
    label: "Permissions",
    iconKey: "users",
    icon: ShieldCheck,
  },
  {
    href: "/admin/platform/feature-flags",
    label: "Feature Flags",
    iconKey: "dashboard",
    icon: Flag,
  },
  { href: "/admin/audit-log", label: "Audit Log", iconKey: "audit-log", icon: ScrollText },
];

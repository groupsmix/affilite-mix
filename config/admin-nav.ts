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
  Settings,
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
  /** True when the route needs an active tenant/site before it can load useful data. */
  requiresActiveSite?: boolean;
}

export const adminNavItems: AdminNavItem[] = [
  { href: "/q7m-k4j9", label: "Dashboard", iconKey: "dashboard", icon: LayoutDashboard, requiresActiveSite: true },
  { href: "/q7m-k4j9/analytics", label: "Analytics", iconKey: "analytics", icon: BarChart3, requiresActiveSite: true },
  { href: "/q7m-k4j9/ai-content", label: "AI Content", iconKey: "content", icon: Sparkles, requiresActiveSite: true },
  { href: "/q7m-k4j9/categories", label: "Categories", iconKey: "categories", icon: FolderTree, requiresActiveSite: true },
  { href: "/q7m-k4j9/products", label: "Products", iconKey: "products", icon: Package, requiresActiveSite: true },
  { href: "/q7m-k4j9/content", label: "Content", iconKey: "content", icon: FileText, requiresActiveSite: true },
  { href: "/q7m-k4j9/pages", label: "Pages", iconKey: "pages", icon: Files, requiresActiveSite: true },
  { href: "/q7m-k4j9/ads", label: "Ad Placements", iconKey: "ads", icon: Megaphone, requiresActiveSite: true },
  {
    href: "/q7m-k4j9/affiliate-networks",
    requiresActiveSite: true,
    label: "Affiliate Networks",
    iconKey: "sites",
    icon: LinkIcon,
  },
  { href: "/q7m-k4j9/users", label: "Users", iconKey: "users", icon: Users },
  { href: "/q7m-k4j9/sites", label: "Sites", iconKey: "sites", icon: Globe },
  { href: "/q7m-k4j9/platform/modules", label: "Modules", iconKey: "products", icon: Puzzle, requiresActiveSite: true },
  {
    href: "/q7m-k4j9/platform/integrations",
    requiresActiveSite: true,
    label: "Integrations",
    iconKey: "sites",
    icon: Plug,
  },
  {
    href: "/q7m-k4j9/platform/permissions",
    requiresActiveSite: true,
    label: "Permissions",
    iconKey: "users",
    icon: ShieldCheck,
  },
  {
    href: "/q7m-k4j9/platform/feature-flags",
    requiresActiveSite: true,
    label: "Feature Flags",
    iconKey: "dashboard",
    icon: Flag,
  },
  { href: "/q7m-k4j9/audit-log", label: "Audit Log", iconKey: "audit-log", icon: ScrollText, requiresActiveSite: true },
  { href: "/q7m-k4j9/settings", label: "Settings", iconKey: "settings", icon: Settings },
];

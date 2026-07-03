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

import { adminRoute, ADMIN_SETTINGS_PATH } from "@/lib/admin-paths";

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
  {
    href: adminRoute(),
    label: "Dashboard",
    iconKey: "dashboard",
    icon: LayoutDashboard,
    requiresActiveSite: true,
  },
  {
    href: adminRoute("/analytics"),
    label: "Analytics",
    iconKey: "analytics",
    icon: BarChart3,
    requiresActiveSite: true,
  },
  {
    href: adminRoute("/ai-content"),
    label: "AI Content",
    iconKey: "content",
    icon: Sparkles,
    requiresActiveSite: true,
  },
  {
    href: adminRoute("/categories"),
    label: "Categories",
    iconKey: "categories",
    icon: FolderTree,
    requiresActiveSite: true,
  },
  {
    href: adminRoute("/products"),
    label: "Products",
    iconKey: "products",
    icon: Package,
    requiresActiveSite: true,
  },
  {
    href: adminRoute("/content"),
    label: "Content",
    iconKey: "content",
    icon: FileText,
    requiresActiveSite: true,
  },
  {
    href: adminRoute("/pages"),
    label: "Pages",
    iconKey: "pages",
    icon: Files,
    requiresActiveSite: true,
  },
  {
    href: adminRoute("/ads"),
    label: "Ad Placements",
    iconKey: "ads",
    icon: Megaphone,
    requiresActiveSite: true,
  },
  {
    href: adminRoute("/affiliate-networks"),
    requiresActiveSite: true,
    label: "Affiliate Networks",
    iconKey: "sites",
    icon: LinkIcon,
  },
  { href: adminRoute("/users"), label: "Users", iconKey: "users", icon: Users },
  { href: adminRoute("/sites"), label: "Sites", iconKey: "sites", icon: Globe },
  {
    href: adminRoute("/platform/modules"),
    label: "Modules",
    iconKey: "products",
    icon: Puzzle,
    requiresActiveSite: true,
  },
  {
    href: adminRoute("/platform/integrations"),
    requiresActiveSite: true,
    label: "Integrations",
    iconKey: "sites",
    icon: Plug,
  },
  {
    href: adminRoute("/platform/permissions"),
    requiresActiveSite: true,
    label: "Permissions",
    iconKey: "users",
    icon: ShieldCheck,
  },
  {
    href: adminRoute("/platform/feature-flags"),
    requiresActiveSite: true,
    label: "Feature Flags",
    iconKey: "dashboard",
    icon: Flag,
  },
  {
    href: adminRoute("/audit-log"),
    label: "Audit Log",
    iconKey: "audit-log",
    icon: ScrollText,
    requiresActiveSite: true,
  },
  { href: ADMIN_SETTINGS_PATH, label: "Settings", iconKey: "settings", icon: Settings },
];

/**
 * Admin sidebar navigation configuration.
 *
 * Each entry maps to a route under the obfuscated admin prefix. Items may carry
 * an optional lucide icon used by the shadcn-based shell (`components/admin/*`).
 * The legacy `iconKey` field is preserved for the older inline-SVG sidebar.
 *
 * Related items are grouped into visual sections via the `section` key; sections
 * are rendered as non-clickable headings in the expanded sidebar.
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
  /** Section key used to group related items under a heading in the sidebar. */
  section?: string;
}

/** Section labels for grouped admin nav items. */
export const adminNavSections: Record<string, string> = {
  content: "Content",
  monetization: "Monetization",
  site: "Site & Modules",
  access: "Access & Features",
};

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
    href: adminRoute("/products"),
    label: "Products",
    iconKey: "products",
    icon: Package,
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
    href: adminRoute("/content"),
    label: "Blog Posts",
    iconKey: "content",
    icon: FileText,
    section: "content",
    requiresActiveSite: true,
  },
  {
    href: adminRoute("/pages"),
    label: "Pages",
    iconKey: "pages",
    icon: Files,
    section: "content",
    requiresActiveSite: true,
  },
  {
    href: adminRoute("/ai-content"),
    label: "AI Generator",
    iconKey: "ai",
    icon: Sparkles,
    section: "content",
    requiresActiveSite: true,
  },
  {
    href: adminRoute("/ads"),
    label: "Ad Placements",
    iconKey: "ads",
    icon: Megaphone,
    section: "monetization",
    requiresActiveSite: true,
  },
  {
    href: adminRoute("/affiliate-networks"),
    label: "Affiliate Networks",
    iconKey: "sites",
    icon: LinkIcon,
    section: "monetization",
    requiresActiveSite: true,
  },
  {
    href: adminRoute("/users"),
    label: "Users",
    iconKey: "users",
    icon: Users,
  },
  {
    href: adminRoute("/sites"),
    label: "Sites",
    iconKey: "sites",
    icon: Globe,
    section: "site",
  },
  {
    href: adminRoute("/platform/modules"),
    label: "Modules",
    iconKey: "modules",
    icon: Puzzle,
    section: "site",
    requiresActiveSite: true,
  },
  {
    href: adminRoute("/platform/permissions"),
    label: "Permissions",
    iconKey: "users",
    icon: ShieldCheck,
    section: "access",
    requiresActiveSite: true,
  },
  {
    href: adminRoute("/platform/feature-flags"),
    label: "Feature Flags",
    iconKey: "dashboard",
    icon: Flag,
    section: "access",
    requiresActiveSite: true,
  },
  {
    href: adminRoute("/platform/integrations"),
    label: "Integrations",
    iconKey: "sites",
    icon: Plug,
    section: "access",
    requiresActiveSite: true,
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

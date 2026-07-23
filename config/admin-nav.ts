/**
 * Admin sidebar navigation configuration.
 *
 * Each entry maps to a route under the obfuscated admin prefix. Items may carry
 * an optional lucide icon used by the shadcn-based shell (`components/admin/*`).
 * The legacy `iconKey` field is preserved for the older inline-SVG sidebar.
 *
 * Top-level items are the primary groups in the sidebar. Child `items` are
 * rendered indented beneath their parent group so the top nav stays compact.
 */

import {
  BarChart3,
  Calendar,
  Coins,
  FileText,
  Files,
  FolderTree,
  Globe,
  Home,
  Image,
  LayoutDashboard,
  Link as LinkIcon,
  type LucideIcon,
  Megaphone,
  Package,
  Palette,
  Plug,
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
  /** Nested pages rendered under this group in the expanded sidebar. */
  items?: AdminNavItem[];
  /** Restrict this item to super admins only. */
  requiresSuperAdmin?: boolean;
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
    href: adminRoute("/homepage"),
    label: "Homepage",
    iconKey: "homepage",
    icon: Home,
    requiresActiveSite: true,
  },
  {
    href: adminRoute("/content"),
    label: "Content",
    iconKey: "content",
    icon: FileText,
    requiresActiveSite: true,
    items: [
      {
        href: adminRoute("/content"),
        label: "Blog Posts",
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
        href: adminRoute("/ai-content"),
        label: "AI Generator",
        iconKey: "ai",
        icon: Sparkles,
        requiresActiveSite: true,
      },
      {
        href: adminRoute("/automation"),
        label: "Automation",
        iconKey: "automation",
        icon: Calendar,
        requiresActiveSite: true,
      },
      {
        href: adminRoute("/media"),
        label: "Media",
        iconKey: "media",
        icon: Image,
        requiresActiveSite: true,
      },
    ],
  },
  {
    href: adminRoute("/appearance"),
    label: "Appearance",
    iconKey: "appearance",
    icon: Palette,
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
  },
  {
    href: adminRoute("/monetization"),
    label: "Monetization",
    iconKey: "monetization",
    icon: Coins,
    requiresActiveSite: true,
    items: [
      {
        href: adminRoute("/ads"),
        label: "Ad Placements",
        iconKey: "ads",
        icon: Megaphone,
        requiresActiveSite: true,
      },
      {
        href: adminRoute("/affiliate-networks"),
        label: "Affiliate Networks",
        iconKey: "affiliate-networks",
        icon: LinkIcon,
        requiresActiveSite: true,
      },
    ],
  },
  {
    href: ADMIN_SETTINGS_PATH,
    label: "Settings",
    iconKey: "settings",
    icon: Settings,
    items: [
      {
        href: ADMIN_SETTINGS_PATH,
        label: "Settings",
        iconKey: "settings",
        icon: Settings,
      },
      {
        href: adminRoute("/platform/permissions"),
        label: "Permissions",
        iconKey: "users",
        icon: ShieldCheck,
        requiresActiveSite: true,
        requiresSuperAdmin: true,
      },
      {
        href: adminRoute("/platform/integrations"),
        label: "Integrations",
        iconKey: "sites",
        icon: Plug,
        requiresActiveSite: true,
        requiresSuperAdmin: true,
      },
      {
        href: adminRoute("/audit-log"),
        label: "Audit Log",
        iconKey: "audit-log",
        icon: ScrollText,
        requiresActiveSite: true,
      },
    ],
  },
];

/**
 * Admin sidebar navigation configuration.
 *
 * Each entry maps to a route under /admin and an icon key that the sidebar
 * component resolves to an SVG icon. Adding, removing, or reordering items
 * here is all that is needed to change the sidebar navigation.
 */

export interface AdminNavItem {
  href: string;
  label: string;
  /** Key used by the sidebar to look up the matching icon component */
  iconKey: string;
}

export const adminNavItems: AdminNavItem[] = [
  { href: "/admin", label: "Dashboard", iconKey: "dashboard" },
  { href: "/admin/analytics", label: "Analytics", iconKey: "analytics" },
  { href: "/admin/categories", label: "Categories", iconKey: "categories" },
  { href: "/admin/products", label: "Products", iconKey: "products" },
  { href: "/admin/content", label: "Content", iconKey: "content" },
  { href: "/admin/pages", label: "Pages", iconKey: "pages" },
  { href: "/admin/ads", label: "Ad Placements", iconKey: "ads" },
  { href: "/admin/users", label: "Users", iconKey: "users" },
  { href: "/admin/sites", label: "Sites", iconKey: "sites" },
  { href: "/admin/platform/modules", label: "Modules", iconKey: "products" },
  { href: "/admin/platform/integrations", label: "Integrations", iconKey: "sites" },
  { href: "/admin/platform/permissions", label: "Permissions", iconKey: "users" },
  { href: "/admin/platform/feature-flags", label: "Feature Flags", iconKey: "dashboard" },
  { href: "/admin/audit-log", label: "Audit Log", iconKey: "audit-log" },
];

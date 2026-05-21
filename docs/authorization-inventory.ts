/**
 * Authorization inventory for app/api/admin/* routes.
 *
 * This file documents the authorization model for each admin route,
 * making it easy to audit and verify that tenant isolation is maintained.
 *
 * Authorization models:
 * - requireAdmin: Validates admin session, active site cookie, and membership
 * - requireSuperAdmin: Validates super_admin role
 * - withAuthz: Validates session + permission for current site
 * - withAuthzDynamic: Validates session + permission for dynamic routes (with [id])
 * - Public: No auth required (for health checks, etc.)
 * - Cron: Cron secret authentication
 * - Webhook: Signature verification
 *
 * Routes are organized by resource type for easy auditing.
 */

/**
 * CONTENT & PRODUCTS
 * These routes handle content and product management, scoped to active site.
 */
export const contentAndProducts = {
  "app/api/admin/content/route.ts": {
    guards: ["withAuthz"],
    model: "site-scoped admin",
    features: ["content"],
    actions: ["view", "create", "edit", "delete"],
  },
  "app/api/admin/content/clone/route.ts": {
    guards: ["withAuthz"],
    model: "site-scoped admin",
    features: ["content"],
    actions: ["create"],
  },
  "app/api/admin/content/share/route.ts": {
    guards: ["withAuthz"],
    model: "site-scoped admin",
    features: ["content"],
    actions: ["edit"],
  },
  "app/api/admin/content-products/route.ts": {
    guards: ["withAuthz"],
    model: "site-scoped admin",
    features: ["products"],
    actions: ["view", "create", "edit", "delete"],
  },
  "app/api/admin/products/route.ts": {
    guards: ["withAuthz"],
    model: "site-scoped admin",
    features: ["products"],
    actions: ["view", "create", "edit", "delete"],
  },
  "app/api/admin/products/import/route.ts": {
    guards: ["withAuthz"],
    model: "site-scoped admin",
    features: ["products"],
    actions: ["create"],
  },
  "app/api/admin/products/export/route.ts": {
    guards: ["withAuthz"],
    model: "site-scoped admin",
    features: ["products"],
    actions: ["view"],
  },
};

/**
 * SITE MANAGEMENT (Multi-tenant)
 * These routes handle site configuration, restricted to super_admin.
 */
export const siteManagement = {
  "app/api/admin/sites/route.ts": {
    guards: ["requireSuperAdmin"],
    model: "super_admin only",
    description: "Full site CRUD - super_admin only",
  },
  "app/api/admin/sites/[id]/route.ts": {
    guards: ["requireSuperAdmin"],
    model: "super_admin only",
    description: "Single site management - super_admin only",
  },
  "app/api/admin/sites/active/route.ts": {
    guards: ["requireAdmin"],
    model: "site-scoped admin",
    description: "Set active site for admin session",
  },
  "app/api/admin/sites/select/route.ts": {
    guards: ["requireAdmin"],
    model: "site-scoped admin",
    description: "Site selector - requires membership",
  },
  "app/api/admin/sites/stats/route.ts": {
    guards: ["requireAdmin"],
    model: "site-scoped admin",
    description: "Site statistics - scoped to active site",
  },
  "app/api/admin/sites/templates/route.ts": {
    guards: ["requireSuperAdmin"],
    model: "super_admin only",
    description: "Site templates - super_admin only",
  },
};

/**
 * USER MANAGEMENT
 * Admin user operations, restricted to super_admin.
 */
export const userManagement = {
  "app/api/admin/users/route.ts": {
    guards: ["requireSuperAdmin"],
    model: "super_admin only",
    description: "Admin user CRUD - super_admin only",
  },
  "app/api/admin/users/me/route.ts": {
    guards: ["requireAdmin"],
    model: "site-scoped admin",
    description: "Current user profile",
  },
  "app/api/admin/users/me/password/route.ts": {
    guards: ["requireAdmin"],
    model: "site-scoped admin",
    description: "Password change for current user",
  },
  "app/api/admin/users/me/totp/route.ts": {
    guards: ["requireAdmin"],
    model: "site-scoped admin",
    description: "TOTP setup for current user",
  },
};

/**
 * CATEGORIES & TAXONOMY
 * Category management, scoped to active site.
 */
export const categories = {
  "app/api/admin/categories/route.ts": {
    guards: ["withAuthz"],
    model: "site-scoped admin",
    features: ["categories"],
    actions: ["view", "create", "edit", "delete"],
  },
  "app/api/admin/categories/usage/route.ts": {
    guards: ["withAuthz"],
    model: "site-scoped admin",
    features: ["categories"],
    actions: ["view"],
  },
};

/**
 * PAGES
 * Static pages management, scoped to active site.
 */
export const pages = {
  "app/api/admin/pages/route.ts": {
    guards: ["withAuthz"],
    model: "site-scoped admin",
    features: ["pages"],
    actions: ["view", "create", "edit", "delete"],
  },
  "app/api/admin/pages/[id]/route.ts": {
    guards: ["withAuthzDynamic"],
    model: "site-scoped admin",
    features: ["pages"],
    actions: ["view", "edit", "delete"],
  },
  "app/api/admin/pages/reorder/route.ts": {
    guards: ["withAuthz"],
    model: "site-scoped admin",
    features: ["pages"],
    actions: ["edit"],
  },
};

/**
 * ADS & MONETIZATION
 * Ad placement management, scoped to active site.
 */
export const adsAndMonetization = {
  "app/api/admin/ads/route.ts": {
    guards: ["withAuthz"],
    model: "site-scoped admin",
    features: ["ad_placements"],
    actions: ["view", "create", "edit", "delete"],
  },
  "app/api/admin/ads/[id]/route.ts": {
    guards: ["withAuthzDynamic"],
    model: "site-scoped admin",
    features: ["ad_placements"],
    actions: ["view", "edit", "delete"],
  },
};

/**
 * AFFILIATE & ANALYTICS
 * Affiliate network management and analytics, scoped to active site.
 */
export const affiliateAndAnalytics = {
  "app/api/admin/affiliate-networks/route.ts": {
    guards: ["withAuthz"],
    model: "site-scoped admin",
    features: ["affiliate_networks"],
    actions: ["view", "create", "edit", "delete"],
  },
  "app/api/admin/analytics/route.ts": {
    guards: ["withAuthz"],
    model: "site-scoped admin",
    features: ["analytics"],
    actions: ["view"],
  },
};

/**
 * MEDIA & UPLOADS
 * R2 image upload management, scoped to active site.
 */
export const mediaAndUploads = {
  "app/api/admin/upload/route.ts": {
    guards: ["withAuthz"],
    model: "site-scoped admin",
    features: ["media"],
    actions: ["create"],
  },
  "app/api/admin/upload/finalize/route.ts": {
    guards: ["withAuthz"],
    model: "site-scoped admin",
    features: ["media"],
    actions: ["create"],
  },
};

/**
 * SYSTEM & SECURITY
 * Feature flags, permissions, privacy requests - restricted to super_admin.
 */
export const systemAndSecurity = {
  "app/api/admin/feature-flags/route.ts": {
    guards: ["requireSuperAdmin"],
    model: "super_admin only",
    description: "Feature flag management - super_admin only",
  },
  "app/api/admin/permissions/route.ts": {
    guards: ["requireSuperAdmin"],
    model: "super_admin only",
    description: "Permission management - super_admin only",
  },
  "app/api/admin/privacy/user/route.ts": {
    guards: ["requireAdmin"],
    model: "site-scoped admin",
    description: "Privacy/GDPR requests",
  },
};

/**
 * SCHEDULING & AUTOMATION
 * Scheduled job management, scoped to active site.
 */
export const schedulingAndAutomation = {
  "app/api/admin/schedule/route.ts": {
    guards: ["withAuthz"],
    model: "site-scoped admin",
    features: ["scheduled_jobs"],
    actions: ["view", "create", "edit", "delete"],
  },
  "app/api/admin/ai-content/route.ts": {
    guards: ["withAuthz"],
    model: "site-scoped admin",
    features: ["ai_content"],
    actions: ["view", "create", "edit", "delete"],
  },
};

/**
 * INTERNAL & INTEGRATIONS
 * Internal APIs and external integrations.
 */
export const internalAndIntegrations = {
  "app/api/admin/integrations/route.ts": {
    guards: ["withAuthz"],
    model: "site-scoped admin",
    features: ["integrations"],
    actions: ["view", "create", "edit", "delete"],
  },
  "app/api/admin/preview-token/route.ts": {
    guards: ["requireAdmin"],
    model: "site-scoped admin",
    description: "Content preview token generation",
  },
};

/**
 * ALLOWLISTED ROUTES
 * Routes that are explicitly allowed to have different auth patterns.
 * These are documented with their security rationale.
 */
export const allowlistedRoutes = {
  "app/api/admin/sites/route.ts": {
    reason: "Multi-site onboarding requires super_admin privileges",
    securityRationale: "Site creation affects all tenants",
  },
  "app/api/admin/sites/[id]/route.ts": {
    reason: "Site management requires super_admin privileges",
    securityRationale: "Site modification affects all tenant data",
  },
};

/**
 * Utility function to get all routes by guard type
 */
export function getRoutesByGuardType(): Record<string, string[]> {
  const routes: Record<string, string[]> = {
    requireAdmin: [],
    requireSuperAdmin: [],
    withAuthz: [],
    withAuthzDynamic: [],
    public: [],
    cron: [],
    webhook: [],
  };

  const allRoutes = {
    ...contentAndProducts,
    ...siteManagement,
    ...userManagement,
    ...categories,
    ...pages,
    ...adsAndMonetization,
    ...affiliateAndAnalytics,
    ...mediaAndUploads,
    ...systemAndSecurity,
    ...schedulingAndAutomation,
    ...internalAndIntegrations,
  };

  for (const [path, config] of Object.entries(allRoutes)) {
    const guards = config.guards || [];
    for (const guard of guards) {
      if (routes[guard]) {
        routes[guard].push(path);
      }
    }
  }

  return routes;
}

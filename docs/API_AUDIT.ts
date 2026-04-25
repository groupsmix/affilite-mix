/**
 * API Route Metadata Audit Registry
 * 
 * Used to ensure all routes conform to expected security postures.
 */

export const ApiRouteAuditRegistry = [
  {
    path: "/api/auth/login",
    method: "POST",
    authRequired: false,
    adminRequired: false,
    tenantScope: "none",
    rateLimit: "strict",
    csrf: "required",
    sensitiveRedacted: true
  },
  {
    path: "/api/auth/forgot-password",
    method: "POST",
    authRequired: false,
    adminRequired: false,
    tenantScope: "none",
    rateLimit: "strict",
    csrf: "required",
    sensitiveRedacted: true
  },
  {
    path: "/api/admin/products",
    method: "GET",
    authRequired: true,
    adminRequired: true,
    tenantScope: "required",
    rateLimit: "standard",
    csrf: "exempt-get",
    sensitiveRedacted: true
  },
  {
    path: "/api/track/click",
    method: "POST",
    authRequired: false,
    adminRequired: false,
    tenantScope: "required",
    rateLimit: "standard",
    csrf: "required",
    sensitiveRedacted: true
  },
  {
    path: "/api/cron/price-scrape",
    method: "POST",
    authRequired: true, // Cron multi-secret
    adminRequired: false,
    tenantScope: "none",
    rateLimit: "standard",
    csrf: "exempt-cron",
    sensitiveRedacted: true
  }
];

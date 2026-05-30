/**
 * Client-side fetch helpers for the analytics dashboard API.
 *
 * All endpoints sit behind admin auth + CSRF and return JSON.
 * These functions are called from client components.
 */

export interface RevenueTrendPoint {
  date: string;
  clicks: number;
  revenue: number;
}

export interface RevenueTrendResponse {
  days: number;
  trend: RevenueTrendPoint[];
}

export interface TopProductRow {
  product_name: string;
  click_count: number;
  estimatedRevenue: number;
}

export interface TopProductsResponse {
  days: number;
  products: TopProductRow[];
}

export interface DomainPerformanceRow {
  siteId: string;
  slug: string;
  name: string;
  domain: string;
  clicks: number;
  revenue: number;
}

export interface DomainsResponse {
  days: number;
  domains: DomainPerformanceRow[];
}

export interface ConversionFunnelStep {
  stage: string;
  count: number;
}

export interface ConversionResponse {
  funnel: ConversionFunnelStep[];
}

export interface AnalyticsSummaryResponse {
  days: number;
  totalClicks: number;
  estimatedRevenue: number;
  avgOrderValue: number;
  growthRatePct: number;
  activeProducts: number;
  publishedContent: number;
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Analytics API error: ${res.status} ${res.statusText}`);
  }
  return res.json() as Promise<T>;
}

export function fetchRevenueTrend(days = 30): Promise<RevenueTrendResponse> {
  return fetchJson(`/api/admin/analytics/revenue?days=${days}`);
}

export function fetchTopProducts(days = 30, limit = 20): Promise<TopProductsResponse> {
  return fetchJson(`/api/admin/analytics/products?days=${days}&limit=${limit}`);
}

export function fetchDomains(days = 7): Promise<DomainsResponse> {
  return fetchJson(`/api/admin/analytics/domains?days=${days}`);
}

export function fetchConversion(): Promise<ConversionResponse> {
  return fetchJson("/api/admin/analytics/conversion");
}

export function fetchAnalyticsSummary(days = 30): Promise<AnalyticsSummaryResponse> {
  return fetchJson(`/api/admin/analytics/summary?days=${days}`);
}

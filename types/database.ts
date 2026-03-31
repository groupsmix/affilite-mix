/** Database row types matching the actual Supabase schema */

export interface SiteRow {
  id: string;
  slug: string;
  name: string;
  domain: string;
  language: string;
  direction: "ltr" | "rtl";
  is_active: boolean;

  // Monetization
  monetization_type: "affiliate" | "ads" | "both";
  est_revenue_per_click: number;
  ad_config: Record<string, unknown>;

  // Theming
  theme: Record<string, unknown>;
  logo_url: string | null;
  favicon_url: string | null;

  // Navigation
  nav_items: { label: string; href: string; icon?: string }[];
  footer_nav: { label: string; href: string; icon?: string }[];

  // Features
  features: Record<string, boolean>;

  // SEO
  meta_title: string | null;
  meta_description: string | null;
  og_image_url: string | null;

  // Social links
  social_links: Record<string, string>;

  // Custom CSS overrides
  custom_css: string | null;

  created_at: string;
  updated_at: string;
}

export type TaxonomyType = "general" | "budget" | "occasion" | "recipient" | "brand";

export interface CategoryRow {
  id: string;
  site_id: string;
  name: string;
  slug: string;
  description: string;
  taxonomy_type: TaxonomyType;
  created_at: string;
}

export interface ProductRow {
  id: string;
  site_id: string;
  name: string;
  slug: string;
  description: string;
  affiliate_url: string;
  image_url: string;
  image_alt: string;
  price: string;
  price_amount: number | null;
  price_currency: string;
  merchant: string;
  score: number | null;
  featured: boolean;
  status: "draft" | "active" | "archived";
  category_id: string | null;
  cta_text: string;
  deal_text: string;
  deal_expires_at: string | null;
  pros: string;
  cons: string;
  created_at: string;
  updated_at: string;
}

export interface ContentRow {
  id: string;
  site_id: string;
  title: string;
  slug: string;
  body: string;
  excerpt: string;
  featured_image: string;
  type: "article" | "review" | "comparison" | "guide" | "blog";
  status: "draft" | "review" | "published" | "scheduled" | "archived";
  category_id: string | null;
  tags: string[];
  author: string | null;
  publish_at: string | null;
  meta_title: string | null;
  meta_description: string | null;
  og_image: string | null;
  created_at: string;
  updated_at: string;
}

export interface ContentProductRow {
  content_id: string;
  product_id: string;
  role: "hero" | "featured" | "related" | "vs-left" | "vs-right";
}

export interface PageRow {
  id: string;
  site_id: string;
  slug: string;
  title: string;
  body: string;
  is_published: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface AffiliateClickRow {
  id: string;
  site_id: string;
  product_name: string;
  affiliate_url: string;
  content_slug: string;
  referrer: string;
  created_at: string;
}

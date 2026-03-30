/** Database row types matching the actual Supabase schema */

export interface SiteRow {
  id: string;
  slug: string;
  name: string;
  domain: string;
  language: string;
  direction: "ltr" | "rtl";
  created_at: string;
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

export interface AffiliateClickRow {
  id: string;
  site_id: string;
  product_name: string;
  affiliate_url: string;
  content_slug: string;
  referrer: string;
  created_at: string;
}

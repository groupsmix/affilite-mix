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

export interface CategoryRow {
  id: string;
  site_id: string;
  name: string;
  slug: string;
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
  price: string;
  merchant: string;
  score: number | null;
  featured: boolean;
  status: "draft" | "active" | "archived";
  category_id: string | null;
  created_at: string;
}

export interface ContentRow {
  id: string;
  site_id: string;
  title: string;
  slug: string;
  body: string;
  excerpt: string;
  type: string;
  status: "draft" | "review" | "published" | "archived";
  category_id: string | null;
  tags: string[];
  author: string | null;
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

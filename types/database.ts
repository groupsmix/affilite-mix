/** Database row types matching Supabase schema */

export interface SiteRow {
  id: string;
  name: string;
  domain: string;
  language: string;
  direction: "ltr" | "rtl";
  locale: string;
  is_active: boolean;
  created_at: string;
}

export interface CategoryRow {
  id: string;
  site_id: string;
  name: string;
  slug: string;
  description: string;
  sort_order: number;
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
  is_featured: boolean;
  is_active: boolean;
  status: "draft" | "active" | "archived";
  category_id: string | null;
  metadata: Record<string, unknown>;
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
  content_type: string;
  status: "draft" | "review" | "published" | "archived";
  category_id: string | null;
  featured_image: string | null;
  meta_title: string | null;
  meta_description: string | null;
  tags: string[];
  published_at: string | null;
  author: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface ContentProductRow {
  content_id: string;
  product_id: string;
  site_id: string;
  position: number;
  role: "hero" | "featured" | "related" | "vs-left" | "vs-right";
  custom_aff_url: string | null;
}

export interface AffiliateClickRow {
  id: string;
  site_id: string;
  product_id: string | null;
  product_slug: string;
  source_page: string;
  source_type: string;
  destination_url: string;
  ip_hash: string | null;
  user_agent: string | null;
  referrer: string | null;
  country: string | null;
  created_at: string;
}

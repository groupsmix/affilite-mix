/**
 * Supabase Database type definitions.
 *
 * These types mirror the live schema so that `createClient<Database>()`
 * gives us compile-time safety on every `.insert()` / `.update()` call,
 * eliminating the need for `as never` casts.
 *
 * To regenerate after a schema change:
 *   npx supabase gen types typescript --project-id <id> > types/supabase.ts
 * Then re-apply any manual additions (e.g. audit_log).
 */

export interface Database {
  public: {
    Tables: {
      sites: {
        Row: {
          id: string;
          slug: string;
          name: string;
          domain: string;
          language: string;
          direction: string;
          is_active: boolean;
          monetization_type: string;
          est_revenue_per_click: number;
          ad_config: Record<string, unknown>;
          theme: Record<string, unknown>;
          logo_url: string | null;
          favicon_url: string | null;
          nav_items: { label: string; href: string; icon?: string }[];
          footer_nav: { label: string; href: string; icon?: string }[];
          features: Record<string, boolean>;
          meta_title: string | null;
          meta_description: string | null;
          og_image_url: string | null;
          social_links: Record<string, string>;
          custom_css: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          slug: string;
          name: string;
          domain: string;
          language?: string;
          direction?: string;
          is_active?: boolean;
          monetization_type?: string;
          est_revenue_per_click?: number;
          ad_config?: Record<string, unknown>;
          theme?: Record<string, unknown>;
          logo_url?: string | null;
          favicon_url?: string | null;
          nav_items?: { label: string; href: string; icon?: string }[];
          footer_nav?: { label: string; href: string; icon?: string }[];
          features?: Record<string, boolean>;
          meta_title?: string | null;
          meta_description?: string | null;
          og_image_url?: string | null;
          social_links?: Record<string, string>;
          custom_css?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          slug?: string;
          name?: string;
          domain?: string;
          language?: string;
          direction?: string;
          is_active?: boolean;
          monetization_type?: string;
          est_revenue_per_click?: number;
          ad_config?: Record<string, unknown>;
          theme?: Record<string, unknown>;
          logo_url?: string | null;
          favicon_url?: string | null;
          nav_items?: { label: string; href: string; icon?: string }[];
          footer_nav?: { label: string; href: string; icon?: string }[];
          features?: Record<string, boolean>;
          meta_title?: string | null;
          meta_description?: string | null;
          og_image_url?: string | null;
          social_links?: Record<string, string>;
          custom_css?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };

      categories: {
        Row: {
          id: string;
          site_id: string;
          name: string;
          slug: string;
          description: string;
          taxonomy_type: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          site_id: string;
          name: string;
          slug: string;
          description?: string;
          taxonomy_type?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          site_id?: string;
          name?: string;
          slug?: string;
          description?: string;
          taxonomy_type?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "categories_site_id_fkey";
            columns: ["site_id"];
            isOneToOne: false;
            referencedRelation: "sites";
            referencedColumns: ["id"];
          },
        ];
      };

      products: {
        Row: {
          id: string;
          site_id: string;
          name: string;
          slug: string;
          description: string;
          affiliate_url: string;
          image_url: string;
          price: string;
          price_amount: number | null;
          price_currency: string;
          merchant: string;
          score: number | null;
          featured: boolean;
          status: string;
          category_id: string | null;
          cta_text: string;
          deal_text: string;
          deal_expires_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          site_id: string;
          name: string;
          slug: string;
          description?: string;
          affiliate_url?: string;
          image_url?: string;
          price?: string;
          price_amount?: number | null;
          price_currency?: string;
          merchant?: string;
          score?: number | null;
          featured?: boolean;
          status?: string;
          category_id?: string | null;
          cta_text?: string;
          deal_text?: string;
          deal_expires_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          site_id?: string;
          name?: string;
          slug?: string;
          description?: string;
          affiliate_url?: string;
          image_url?: string;
          price?: string;
          price_amount?: number | null;
          price_currency?: string;
          merchant?: string;
          score?: number | null;
          featured?: boolean;
          status?: string;
          category_id?: string | null;
          cta_text?: string;
          deal_text?: string;
          deal_expires_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "products_site_id_fkey";
            columns: ["site_id"];
            isOneToOne: false;
            referencedRelation: "sites";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "products_category_id_fkey";
            columns: ["category_id"];
            isOneToOne: false;
            referencedRelation: "categories";
            referencedColumns: ["id"];
          },
        ];
      };

      content: {
        Row: {
          id: string;
          site_id: string;
          title: string;
          slug: string;
          body: string;
          excerpt: string;
          featured_image: string;
          type: string;
          status: string;
          category_id: string | null;
          tags: string[];
          author: string | null;
          publish_at: string | null;
          meta_title: string | null;
          meta_description: string | null;
          og_image: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          site_id: string;
          title: string;
          slug: string;
          body?: string;
          excerpt?: string;
          featured_image?: string;
          type?: string;
          status?: string;
          category_id?: string | null;
          tags?: string[];
          author?: string | null;
          publish_at?: string | null;
          meta_title?: string | null;
          meta_description?: string | null;
          og_image?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          site_id?: string;
          title?: string;
          slug?: string;
          body?: string;
          excerpt?: string;
          featured_image?: string;
          type?: string;
          status?: string;
          category_id?: string | null;
          tags?: string[];
          author?: string | null;
          publish_at?: string | null;
          meta_title?: string | null;
          meta_description?: string | null;
          og_image?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "content_site_id_fkey";
            columns: ["site_id"];
            isOneToOne: false;
            referencedRelation: "sites";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "content_category_id_fkey";
            columns: ["category_id"];
            isOneToOne: false;
            referencedRelation: "categories";
            referencedColumns: ["id"];
          },
        ];
      };

      content_products: {
        Row: {
          content_id: string;
          product_id: string;
          role: string;
        };
        Insert: {
          content_id: string;
          product_id: string;
          role?: string;
        };
        Update: {
          content_id?: string;
          product_id?: string;
          role?: string;
        };
        Relationships: [
          {
            foreignKeyName: "content_products_content_id_fkey";
            columns: ["content_id"];
            isOneToOne: false;
            referencedRelation: "content";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "content_products_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
        ];
      };

      newsletter_subscribers: {
        Row: {
          id: string;
          site_id: string;
          email: string;
          status: string;
          confirmation_token: string | null;
          confirmed_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          site_id: string;
          email: string;
          status?: string;
          confirmation_token?: string | null;
          confirmed_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          site_id?: string;
          email?: string;
          status?: string;
          confirmation_token?: string | null;
          confirmed_at?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "newsletter_subscribers_site_id_fkey";
            columns: ["site_id"];
            isOneToOne: false;
            referencedRelation: "sites";
            referencedColumns: ["id"];
          },
        ];
      };

      affiliate_clicks: {
        Row: {
          id: string;
          site_id: string;
          product_name: string;
          affiliate_url: string;
          content_slug: string;
          referrer: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          site_id?: string;
          product_name?: string;
          affiliate_url?: string;
          content_slug?: string;
          referrer?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          site_id?: string;
          product_name?: string;
          affiliate_url?: string;
          content_slug?: string;
          referrer?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "affiliate_clicks_site_id_fkey";
            columns: ["site_id"];
            isOneToOne: false;
            referencedRelation: "sites";
            referencedColumns: ["id"];
          },
        ];
      };

      scheduled_jobs: {
        Row: {
          id: string;
          site_id: string;
          job_type: string;
          target_id: string;
          scheduled_for: string;
          status: string;
          payload: Record<string, unknown>;
          executed_at: string | null;
          error: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          site_id: string;
          job_type: string;
          target_id: string;
          scheduled_for: string;
          status?: string;
          payload?: Record<string, unknown>;
          executed_at?: string | null;
          error?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          site_id?: string;
          job_type?: string;
          target_id?: string;
          scheduled_for?: string;
          status?: string;
          payload?: Record<string, unknown>;
          executed_at?: string | null;
          error?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "scheduled_jobs_site_id_fkey";
            columns: ["site_id"];
            isOneToOne: false;
            referencedRelation: "sites";
            referencedColumns: ["id"];
          },
        ];
      };

      admin_users: {
        Row: {
          id: string;
          email: string;
          password_hash: string;
          name: string;
          role: string;
          is_active: boolean;
          reset_token: string | null;
          reset_token_expires_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          email: string;
          password_hash: string;
          name?: string;
          role?: string;
          is_active?: boolean;
          reset_token?: string | null;
          reset_token_expires_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          email?: string;
          password_hash?: string;
          name?: string;
          role?: string;
          is_active?: boolean;
          reset_token?: string | null;
          reset_token_expires_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };

      audit_log: {
        Row: {
          id: string;
          site_id: string;
          actor: string;
          action: string;
          entity_type: string;
          entity_id: string;
          details: Record<string, unknown>;
          ip: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          site_id: string;
          actor: string;
          action: string;
          entity_type: string;
          entity_id: string;
          details?: Record<string, unknown>;
          ip?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          site_id?: string;
          actor?: string;
          action?: string;
          entity_type?: string;
          entity_id?: string;
          details?: Record<string, unknown>;
          ip?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "audit_log_site_id_fkey";
            columns: ["site_id"];
            isOneToOne: false;
            referencedRelation: "sites";
            referencedColumns: ["id"];
          },
        ];
      };

      pages: {
        Row: {
          id: string;
          site_id: string;
          slug: string;
          title: string;
          body: string;
          is_published: boolean;
          sort_order: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          site_id: string;
          slug: string;
          title: string;
          body?: string;
          is_published?: boolean;
          sort_order?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          site_id?: string;
          slug?: string;
          title?: string;
          body?: string;
          is_published?: boolean;
          sort_order?: number;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "pages_site_id_fkey";
            columns: ["site_id"];
            isOneToOne: false;
            referencedRelation: "sites";
            referencedColumns: ["id"];
          },
        ];
      };

      ad_placements: {
        Row: {
          id: string;
          site_id: string;
          name: string;
          placement_type: string;
          provider: string;
          ad_code: string | null;
          config: Record<string, unknown>;
          is_active: boolean;
          priority: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          site_id: string;
          name: string;
          placement_type: string;
          provider: string;
          ad_code?: string | null;
          config?: Record<string, unknown>;
          is_active?: boolean;
          priority?: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          site_id?: string;
          name?: string;
          placement_type?: string;
          provider?: string;
          ad_code?: string | null;
          config?: Record<string, unknown>;
          is_active?: boolean;
          priority?: number;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "ad_placements_site_id_fkey";
            columns: ["site_id"];
            isOneToOne: false;
            referencedRelation: "sites";
            referencedColumns: ["id"];
          },
        ];
      };

      ad_impressions: {
        Row: {
          id: string;
          site_id: string;
          ad_placement_id: string;
          page_path: string;
          impression_date: string;
          count: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          site_id: string;
          ad_placement_id: string;
          page_path: string;
          impression_date: string;
          count?: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          site_id?: string;
          ad_placement_id?: string;
          page_path?: string;
          impression_date?: string;
          count?: number;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "ad_impressions_ad_placement_id_fkey";
            columns: ["ad_placement_id"];
            isOneToOne: false;
            referencedRelation: "ad_placements";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "ad_impressions_site_id_fkey";
            columns: ["site_id"];
            isOneToOne: false;
            referencedRelation: "sites";
            referencedColumns: ["id"];
          },
        ];
      };

      shared_content: {
        Row: {
          id: string;
          content_id: string;
          source_site_id: string;
          target_site_id: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          content_id: string;
          source_site_id: string;
          target_site_id: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          content_id?: string;
          source_site_id?: string;
          target_site_id?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "shared_content_content_id_fkey";
            columns: ["content_id"];
            isOneToOne: false;
            referencedRelation: "content";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "shared_content_source_site_id_fkey";
            columns: ["source_site_id"];
            isOneToOne: false;
            referencedRelation: "sites";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "shared_content_target_site_id_fkey";
            columns: ["target_site_id"];
            isOneToOne: false;
            referencedRelation: "sites";
            referencedColumns: ["id"];
          },
        ];
      };

      web_vitals: {
        Row: {
          id: string;
          name: string;
          value: number;
          metric_id: string | null;
          page: string | null;
          href: string | null;
          rating: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          value: number;
          metric_id?: string | null;
          page?: string | null;
          href?: string | null;
          rating?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          value?: number;
          metric_id?: string | null;
          page?: string | null;
          href?: string | null;
          rating?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };

      niche_templates: {
        Row: {
          id: string;
          name: string;
          slug: string;
          description: string;
          default_theme: Record<string, unknown>;
          default_nav: Record<string, unknown>[];
          default_footer: Record<string, unknown>[];
          default_features: Record<string, boolean>;
          monetization_type: string;
          language: string;
          direction: string;
          custom_css: string;
          social_links: Record<string, string>;
          is_builtin: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          slug: string;
          description?: string;
          default_theme?: Record<string, unknown>;
          default_nav?: Record<string, unknown>[];
          default_footer?: Record<string, unknown>[];
          default_features?: Record<string, boolean>;
          monetization_type?: string;
          language?: string;
          direction?: string;
          custom_css?: string;
          social_links?: Record<string, string>;
          is_builtin?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          slug?: string;
          description?: string;
          default_theme?: Record<string, unknown>;
          default_nav?: Record<string, unknown>[];
          default_footer?: Record<string, unknown>[];
          default_features?: Record<string, boolean>;
          monetization_type?: string;
          language?: string;
          direction?: string;
          custom_css?: string;
          social_links?: Record<string, string>;
          is_builtin?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
    };

    Views: Record<string, never>;
    Functions: {
      get_top_products: {
        Args: { p_site_id: string; p_since: string; p_limit: number };
        Returns: { product_name: string; click_count: number }[];
      };
      get_top_referrers: {
        Args: { p_site_id: string; p_since: string; p_limit: number };
        Returns: { referrer: string; click_count: number }[];
      };
      get_top_content_slugs: {
        Args: { p_site_id: string; p_since: string; p_limit: number };
        Returns: { content_slug: string; click_count: number }[];
      };
      get_daily_clicks: {
        Args: { p_site_id: string; p_since: string };
        Returns: { date: string; count: number }[];
      };
      get_niche_health_stats: {
        Args: { p_seven_days_ago: string; p_fourteen_days_ago: string };
        Returns: {
          site_id: string;
          total_products: number;
          total_content: number;
          clicks_7d: number;
          clicks_prev_7d: number;
          last_published_at: string | null;
          subscriber_count: number;
        }[];
      };
      get_dashboard_stats: {
        Args: {
          p_site_id: string;
          p_today_start: string;
          p_seven_days_ago: string;
        };
        Returns: Record<string, number>;
      };
      reorder_pages: {
        Args: { updates: { id: string; sort_order: number }[] };
        Returns: undefined;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}

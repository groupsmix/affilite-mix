/**
 * Supabase Database type definitions — GENERATED ARTIFACT.
 *
 * These types mirror the live schema so that `createClient<Database>()`
 * gives us compile-time safety on every `.insert()` / `.update()` call,
 * eliminating the need for `as never` casts.
 *
 * Consumed by:
 *   - `lib/supabase.ts`        — browser anon client (`createClient<Database>`)
 *   - `lib/supabase-server.ts` — server service-role client
 *   - `lib/dal/sites.ts`       — typed DAL helpers
 *
 * Do NOT hand-edit. Regenerate after any schema change via the drift
 * script (recommended):
 *
 *   bash scripts/check-schema-drift.sh
 *
 * Or manually against the linked project:
 *
 *   supabase gen types typescript --linked > types/supabase.ts
 *
 * After regenerating, re-apply any manual additions (e.g. the
 * `audit_log` table typing that the generator omits) and commit the
 * result alongside the matching `supabase/schema.sql` snapshot.
 *
 * See `types/database.ts` for the hand-curated app-level row types
 * (`ProductRow`, `ContentRow`, etc.) — that file is NOT regenerated.
 */

export interface Database {
  public: {
    Tables: {
      [key: string]: any;
      epc_metrics: {
        Row: Record<string, any>;
        Insert: Record<string, any>;
        Update: Record<string, any>;
      };
      product_affiliate_links: {
        Row: Record<string, any>;
        Insert: Record<string, any>;
        Update: Record<string, any>;
      };
      authors: {
        Row: Record<string, any>;
        Insert: Record<string, any>;
        Update: Record<string, any>;
      };
      affiliate_tracking_keys: {
        Row: {
          site_id: string;
          network: string;
          tracking_key: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          site_id: string;
          network: string;
          tracking_key: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          site_id?: string;
          network?: string;
          tracking_key?: string;
          created_at?: string;
          updated_at?: string;
        };
      };
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
          monetization_modules: Record<string, unknown>[];
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
          monetization_modules?: Record<string, unknown>[];
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
          monetization_modules?: Record<string, unknown>[];
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
          meta_title: string | null;
          meta_description: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          site_id: string;
          name: string;
          slug: string;
          description?: string;
          taxonomy_type?: string;
          meta_title?: string | null;
          meta_description?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          site_id?: string;
          name?: string;
          slug?: string;
          description?: string;
          taxonomy_type?: string;
          meta_title?: string | null;
          meta_description?: string | null;
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
          image_alt: string;
          pros: string;
          cons: string;
          /**
           * @deprecated Column was renamed to `price_label` in migration 00089.
           * This alias is kept in types only while app code is migrated.
           * The DB column no longer exists. See lib/dal/products.ts LIST_COLUMNS.
           */
          price?: string;
          /** Migration 00089: display price label (renamed from `price`). */
          price_label: string;
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
          /** Migration 2026052302: optimistic-locking version (ISO18-001). */
          version: number;
        };
        Insert: {
          id?: string;
          site_id: string;
          name: string;
          slug: string;
          description?: string;
          affiliate_url?: string;
          image_url?: string;
          image_alt?: string;
          pros?: string;
          cons?: string;
          /** @deprecated Use `price_label`. DB column was renamed in migration 00089. */
          price?: string;
          price_label?: string;
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
          version?: number;
        };
        Update: {
          id?: string;
          site_id?: string;
          name?: string;
          slug?: string;
          description?: string;
          affiliate_url?: string;
          image_url?: string;
          image_alt?: string;
          pros?: string;
          cons?: string;
          /** @deprecated Use `price_label`. DB column was renamed in migration 00089. */
          price?: string;
          price_label?: string;
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
          version?: number;
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
          body_previous: string | null;
          excerpt: string;
          featured_image: string;
          type: string;
          status: string;
          category_id: string | null;
          tags: string[];
          author: string | null;
          author_id: string | null;
          publish_at: string | null;
          meta_title: string | null;
          meta_description: string | null;
          og_image: string | null;
          review_state: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          site_id: string;
          title: string;
          slug: string;
          body?: string;
          body_previous?: string | null;
          excerpt?: string;
          featured_image?: string;
          type?: string;
          status?: string;
          category_id?: string | null;
          tags?: string[];
          author?: string | null;
          author_id?: string | null;
          publish_at?: string | null;
          meta_title?: string | null;
          meta_description?: string | null;
          og_image?: string | null;
          review_state?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          site_id?: string;
          title?: string;
          slug?: string;
          body?: string;
          body_previous?: string | null;
          excerpt?: string;
          featured_image?: string;
          type?: string;
          status?: string;
          category_id?: string | null;
          tags?: string[];
          author?: string | null;
          author_id?: string | null;
          publish_at?: string | null;
          meta_title?: string | null;
          meta_description?: string | null;
          og_image?: string | null;
          review_state?: string;
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
          unsubscribe_token: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          site_id: string;
          email: string;
          status?: string;
          confirmation_token?: string | null;
          confirmed_at?: string | null;
          unsubscribe_token?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          site_id?: string;
          email?: string;
          status?: string;
          confirmation_token?: string | null;
          confirmed_at?: string | null;
          unsubscribe_token?: string | null;
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
          click_id: string | null;
          site_id: string;
          product_name: string;
          affiliate_url: string;
          content_slug: string;
          referrer: string;
          created_at: string;
          // A158/A162: privacy fields added in migration
          // 2026052301_affiliate_clicks_privacy.sql. Nulled by the
          // data-retention cron after 30 days (ip_prefix) and 24 hours
          // (fingerprint).
          ip_prefix: string | null;
          fingerprint: string | null;
          /** Migration 00097 (A158): true when the click originated from a logged-in admin. */
          is_internal: boolean | null;
        };
        Insert: {
          id?: string;
          click_id?: string | null;
          site_id?: string;
          product_name?: string;
          affiliate_url?: string;
          content_slug?: string;
          referrer?: string;
          created_at?: string;
          ip_prefix?: string | null;
          fingerprint?: string | null;
          is_internal?: boolean | null;
        };
        Update: {
          id?: string;
          click_id?: string | null;
          site_id?: string;
          product_name?: string;
          affiliate_url?: string;
          content_slug?: string;
          referrer?: string;
          created_at?: string;
          ip_prefix?: string | null;
          fingerprint?: string | null;
          is_internal?: boolean | null;
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
          run_at: string;
          status: string;
          payload: Record<string, unknown>;
          executed_at: string | null;
          attempts: number | null;
          last_error: string | null;
          error: string | null;
          created_at: string;
          updated_at: string | null;
        };
        Insert: {
          id?: string;
          site_id: string;
          job_type: string;
          target_id: string;
          scheduled_for: string;
          run_at?: string;
          status?: string;
          payload?: Record<string, unknown>;
          executed_at?: string | null;
          attempts?: number | null;
          last_error?: string | null;
          error?: string | null;
          created_at?: string;
          updated_at?: string | null;
        };
        Update: {
          id?: string;
          site_id?: string;
          job_type?: string;
          target_id?: string;
          scheduled_for?: string;
          run_at?: string;
          status?: string;
          payload?: Record<string, unknown>;
          executed_at?: string | null;
          attempts?: number | null;
          last_error?: string | null;
          error?: string | null;
          created_at?: string;
          updated_at?: string | null;
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
          totp_secret: string | null;
          totp_enabled: boolean;
          totp_verified_at: string | null;
          totp_failed_attempts: number;
          totp_locked_until: string | null;
          /** Migration 00096 (A208/T1531): brute-force lockout counter. */
          login_failed_attempts: number;
          /** Migration 00096 (A208/T1531): account locked until this timestamp. */
          login_locked_until: string | null;
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
          totp_secret?: string | null;
          totp_enabled?: boolean | null;
          totp_verified_at?: string | null;
          totp_failed_attempts?: number;
          totp_locked_until?: string | null;
          login_failed_attempts?: number;
          login_locked_until?: string | null;
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
          totp_secret?: string | null;
          totp_enabled?: boolean | null;
          totp_verified_at?: string | null;
          totp_failed_attempts?: number;
          totp_locked_until?: string | null;
          login_failed_attempts?: number;
          login_locked_until?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };

      admin_site_memberships: {
        Row: {
          id: string;
          admin_user_id: string;
          site_id: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          admin_user_id: string;
          site_id: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          admin_user_id?: string;
          site_id?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "admin_site_memberships_admin_user_id_fkey";
            columns: ["admin_user_id"];
            isOneToOne: false;
            referencedRelation: "admin_users";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "admin_site_memberships_site_id_fkey";
            columns: ["site_id"];
            isOneToOne: false;
            referencedRelation: "sites";
            referencedColumns: ["id"];
          },
        ];
      };

      audit_log: {
        Row: {
          id: string;
          site_id: string;
          actor: string | null;
          actor_user_id: string | null;
          user_id: string | null;
          action: string;
          entity: string;
          entity_type: string;
          entity_id: string;
          details: Record<string, unknown>;
          ip: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          site_id: string;
          actor?: string | null;
          actor_user_id?: string | null;
          user_id?: string | null;
          action: string;
          entity?: string;
          entity_type: string;
          entity_id: string;
          details?: Record<string, unknown>;
          ip?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          site_id?: string;
          actor?: string | null;
          actor_user_id?: string | null;
          user_id?: string | null;
          action?: string;
          entity?: string;
          entity_type?: string;
          entity_id?: string;
          details?: Record<string, unknown>;
          ip?: string | null;
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
          content_id: string | null;
          page_path: string;
          impression_date: string;
          count: number;
          impression_count: number;
          cpm_revenue_cents: number;
          last_seen_at: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          site_id: string;
          ad_placement_id: string;
          content_id?: string | null;
          page_path: string;
          impression_date: string;
          count?: number;
          impression_count?: number;
          cpm_revenue_cents?: number;
          last_seen_at?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          site_id?: string;
          ad_placement_id?: string;
          content_id?: string | null;
          page_path?: string;
          impression_date?: string;
          count?: number;
          impression_count?: number;
          cpm_revenue_cents?: number;
          last_seen_at?: string;
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

      site_modules: {
        Row: {
          id: string;
          site_id: string;
          module_key: string;
          is_enabled: boolean;
          config: Record<string, unknown>;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          site_id: string;
          module_key: string;
          is_enabled?: boolean;
          config?: Record<string, unknown>;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          site_id?: string;
          module_key?: string;
          is_enabled?: boolean;
          config?: Record<string, unknown>;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "site_modules_site_id_fkey";
            columns: ["site_id"];
            isOneToOne: false;
            referencedRelation: "sites";
            referencedColumns: ["id"];
          },
        ];
      };

      site_feature_flags: {
        Row: {
          id: string;
          site_id: string;
          flag_key: string;
          is_enabled: boolean;
          description: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          site_id: string;
          flag_key: string;
          is_enabled?: boolean;
          description?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          site_id?: string;
          flag_key?: string;
          is_enabled?: boolean;
          description?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "site_feature_flags_site_id_fkey";
            columns: ["site_id"];
            isOneToOne: false;
            referencedRelation: "sites";
            referencedColumns: ["id"];
          },
        ];
      };

      roles: {
        Row: {
          id: string;
          name: string;
          label: string;
          description: string;
          is_system: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          label: string;
          description?: string;
          is_system?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          label?: string;
          description?: string;
          is_system?: boolean;
          created_at?: string;
        };
        Relationships: [];
      };

      permissions: {
        Row: {
          id: string;
          feature: string;
          action: string;
          description: string;
        };
        Insert: {
          id?: string;
          feature: string;
          action: string;
          description?: string;
        };
        Update: {
          id?: string;
          feature?: string;
          action?: string;
          description?: string;
        };
        Relationships: [];
      };

      role_permissions: {
        Row: {
          role_id: string;
          permission_id: string;
        };
        Insert: {
          role_id: string;
          permission_id: string;
        };
        Update: {
          role_id?: string;
          permission_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "role_permissions_role_id_fkey";
            columns: ["role_id"];
            isOneToOne: false;
            referencedRelation: "roles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "role_permissions_permission_id_fkey";
            columns: ["permission_id"];
            isOneToOne: false;
            referencedRelation: "permissions";
            referencedColumns: ["id"];
          },
        ];
      };

      user_site_roles: {
        Row: {
          id: string;
          user_id: string;
          site_id: string;
          role_id: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          site_id: string;
          role_id: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          site_id?: string;
          role_id?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "user_site_roles_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "admin_users";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "user_site_roles_site_id_fkey";
            columns: ["site_id"];
            isOneToOne: false;
            referencedRelation: "sites";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "user_site_roles_role_id_fkey";
            columns: ["role_id"];
            isOneToOne: false;
            referencedRelation: "roles";
            referencedColumns: ["id"];
          },
        ];
      };

      integration_providers: {
        Row: {
          id: string;
          key: string;
          name: string;
          category: string;
          description: string;
          config_schema: Record<string, unknown>;
          is_builtin: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          key: string;
          name: string;
          category: string;
          description?: string;
          config_schema?: Record<string, unknown>;
          is_builtin?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          key?: string;
          name?: string;
          category?: string;
          description?: string;
          config_schema?: Record<string, unknown>;
          is_builtin?: boolean;
          created_at?: string;
        };
        Relationships: [];
      };

      site_integrations: {
        Row: {
          id: string;
          site_id: string;
          provider_key: string;
          is_enabled: boolean;
          config: Record<string, unknown>;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          site_id: string;
          provider_key: string;
          is_enabled?: boolean;
          config?: Record<string, unknown>;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          site_id?: string;
          provider_key?: string;
          is_enabled?: boolean;
          config?: Record<string, unknown>;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "site_integrations_site_id_fkey";
            columns: ["site_id"];
            isOneToOne: false;
            referencedRelation: "sites";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "site_integrations_provider_key_fkey";
            columns: ["provider_key"];
            isOneToOne: false;
            referencedRelation: "integration_providers";
            referencedColumns: ["key"];
          },
        ];
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

      ai_drafts: {
        Row: {
          id: string;
          site_id: string;
          title: string;
          slug: string;
          body: string;
          excerpt: string;
          content_type: string;
          topic: string;
          keywords: string[];
          ai_provider: string;
          ai_model: string;
          status: "pending" | "approved" | "rejected" | "published";
          generated_at: string;
          reviewed_at: string | null;
          reviewed_by: string | null;
          meta_title: string | null;
          meta_description: string | null;
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
          content_type?: string;
          topic?: string;
          keywords?: string[];
          ai_provider?: string;
          ai_model?: string;
          status?: "pending" | "approved" | "rejected" | "published";
          generated_at?: string;
          reviewed_at?: string | null;
          reviewed_by?: string | null;
          meta_title?: string | null;
          meta_description?: string | null;
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
          content_type?: string;
          topic?: string;
          keywords?: string[];
          ai_provider?: string;
          ai_model?: string;
          status?: "pending" | "approved" | "rejected" | "published";
          generated_at?: string;
          reviewed_at?: string | null;
          reviewed_by?: string | null;
          meta_title?: string | null;
          meta_description?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "ai_drafts_site_id_fkey";
            columns: ["site_id"];
            isOneToOne: false;
            referencedRelation: "sites";
            referencedColumns: ["id"];
          },
        ];
      };

      affiliate_networks: {
        Row: {
          id: string;
          site_id: string;
          network: "cj" | "partnerstack" | "admitad" | "direct";
          publisher_id: string;
          api_key_ref: string;
          is_active: boolean;
          config: Record<string, unknown>;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          site_id: string;
          network: "cj" | "partnerstack" | "admitad" | "direct";
          publisher_id?: string;
          api_key_ref?: string;
          is_active?: boolean;
          config?: Record<string, unknown>;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          site_id?: string;
          network?: "cj" | "partnerstack" | "admitad" | "direct";
          publisher_id?: string;
          api_key_ref?: string;
          is_active?: boolean;
          config?: Record<string, unknown>;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "affiliate_networks_site_id_fkey";
            columns: ["site_id"];
            isOneToOne: false;
            referencedRelation: "sites";
            referencedColumns: ["id"];
          },
        ];
      };

      // ── Migration 00046: price_snapshots + price_alerts ──────────────

      price_snapshots: {
        Row: {
          id: string;
          product_id: string;
          site_id: string;
          price_amount: number;
          currency: string;
          source: string;
          scraped_at: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          product_id: string;
          site_id: string;
          price_amount: number;
          currency?: string;
          source?: string;
          scraped_at?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          product_id?: string;
          site_id?: string;
          price_amount?: number;
          currency?: string;
          source?: string;
          scraped_at?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "price_snapshots_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "price_snapshots_site_id_fkey";
            columns: ["site_id"];
            isOneToOne: false;
            referencedRelation: "sites";
            referencedColumns: ["id"];
          },
        ];
      };

      price_alerts: {
        Row: {
          id: string;
          product_id: string;
          site_id: string;
          email: string;
          target_price: number;
          currency: string;
          is_active: boolean;
          triggered_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          product_id: string;
          site_id: string;
          email: string;
          target_price: number;
          currency?: string;
          is_active?: boolean;
          triggered_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          product_id?: string;
          site_id?: string;
          email?: string;
          target_price?: number;
          currency?: string;
          is_active?: boolean;
          triggered_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "price_alerts_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "price_alerts_site_id_fkey";
            columns: ["site_id"];
            isOneToOne: false;
            referencedRelation: "sites";
            referencedColumns: ["id"];
          },
        ];
      };

      // ── Migration 00047: quiz funnel ─────────────────────────────────

      quizzes: {
        Row: {
          id: string;
          site_id: string;
          slug: string;
          title: string;
          description: string | null;
          steps: unknown;
          result_config: unknown;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          site_id: string;
          slug: string;
          title: string;
          description?: string | null;
          steps?: unknown;
          result_config?: unknown;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          site_id?: string;
          slug?: string;
          title?: string;
          description?: string | null;
          steps?: unknown;
          result_config?: unknown;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "quizzes_site_id_fkey";
            columns: ["site_id"];
            isOneToOne: false;
            referencedRelation: "sites";
            referencedColumns: ["id"];
          },
        ];
      };

      quiz_submissions: {
        Row: {
          id: string;
          quiz_id: string;
          site_id: string;
          session_id: string | null;
          email: string | null;
          answers: unknown;
          result_tags: string[];
          status: string;
          completed_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          quiz_id: string;
          site_id: string;
          session_id?: string | null;
          email?: string | null;
          answers?: unknown;
          result_tags?: string[];
          status?: string;
          completed_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          quiz_id?: string;
          site_id?: string;
          session_id?: string | null;
          email?: string | null;
          answers?: unknown;
          result_tags?: string[];
          status?: string;
          completed_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "quiz_submissions_quiz_id_fkey";
            columns: ["quiz_id"];
            isOneToOne: false;
            referencedRelation: "quizzes";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "quiz_submissions_site_id_fkey";
            columns: ["site_id"];
            isOneToOne: false;
            referencedRelation: "sites";
            referencedColumns: ["id"];
          },
        ];
      };

      drip_campaigns: {
        Row: {
          id: string;
          site_id: string;
          name: string;
          trigger_type: string;
          trigger_quiz_id: string | null;
          steps: unknown;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          site_id: string;
          name: string;
          trigger_type?: string;
          trigger_quiz_id?: string | null;
          steps?: unknown;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          site_id?: string;
          name?: string;
          trigger_type?: string;
          trigger_quiz_id?: string | null;
          steps?: unknown;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "drip_campaigns_site_id_fkey";
            columns: ["site_id"];
            isOneToOne: false;
            referencedRelation: "sites";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "drip_campaigns_trigger_quiz_id_fkey";
            columns: ["trigger_quiz_id"];
            isOneToOne: false;
            referencedRelation: "quizzes";
            referencedColumns: ["id"];
          },
        ];
      };

      drip_enrollments: {
        Row: {
          id: string;
          campaign_id: string;
          email: string;
          current_step: number;
          status: string;
          next_send_at: string | null;
          metadata: unknown;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          campaign_id: string;
          email: string;
          current_step?: number;
          status?: string;
          next_send_at?: string | null;
          metadata?: unknown;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          campaign_id?: string;
          email?: string;
          current_step?: number;
          status?: string;
          next_send_at?: string | null;
          metadata?: unknown;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "drip_enrollments_campaign_id_fkey";
            columns: ["campaign_id"];
            isOneToOne: false;
            referencedRelation: "drip_campaigns";
            referencedColumns: ["id"];
          },
        ];
      };

      // ── Migration 00048: commissions + EPC stats ─────────────────────

      commissions: {
        Row: {
          id: string;
          site_id: string;
          product_id: string | null;
          network: string;
          order_id: string | null;
          click_id: string | null;
          commission_amount: number;
          currency: string;
          status: string;
          sale_amount: number | null;
          event_date: string;
          ingested_at: string;
          raw_data: unknown | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          site_id: string;
          product_id?: string | null;
          network: string;
          order_id?: string | null;
          click_id?: string | null;
          commission_amount: number;
          currency?: string;
          status?: string;
          sale_amount?: number | null;
          event_date: string;
          ingested_at?: string;
          raw_data?: unknown | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          site_id?: string;
          product_id?: string | null;
          network?: string;
          order_id?: string | null;
          click_id?: string | null;
          commission_amount?: number;
          currency?: string;
          status?: string;
          sale_amount?: number | null;
          event_date?: string;
          ingested_at?: string;
          raw_data?: unknown | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "commissions_site_id_fkey";
            columns: ["site_id"];
            isOneToOne: false;
            referencedRelation: "sites";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "commissions_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
        ];
      };

      product_epc_stats: {
        Row: {
          id: string;
          product_id: string;
          network: string;
          clicks_30d: number;
          commissions_30d: number;
          epc_30d: number;
          clicks_7d: number;
          commissions_7d: number;
          epc_7d: number;
          updated_at: string;
        };
        Insert: {
          id?: string;
          product_id: string;
          network: string;
          clicks_30d?: number;
          commissions_30d?: number;
          epc_30d?: number;
          clicks_7d?: number;
          commissions_7d?: number;
          epc_7d?: number;
          updated_at?: string;
        };
        Update: {
          id?: string;
          product_id?: string;
          network?: string;
          clicks_30d?: number;
          commissions_30d?: number;
          epc_30d?: number;
          clicks_7d?: number;
          commissions_7d?: number;
          epc_7d?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "product_epc_stats_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
        ];
      };

      // ── Migration 00049: deals ───────────────────────────────────────

      deals: {
        Row: {
          id: string;
          site_id: string;
          product_id: string | null;
          title: string;
          description: string | null;
          discount_pct: number | null;
          original_price: number | null;
          deal_price: number | null;
          currency: string;
          source: string | null;
          url: string;
          starts_at: string;
          expires_at: string | null;
          is_active: boolean;
          is_featured: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          site_id: string;
          product_id?: string | null;
          title: string;
          description?: string | null;
          discount_pct?: number | null;
          original_price?: number | null;
          deal_price?: number | null;
          currency?: string;
          source?: string | null;
          url: string;
          starts_at?: string;
          expires_at?: string | null;
          is_active?: boolean;
          is_featured?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          site_id?: string;
          product_id?: string | null;
          title?: string;
          description?: string | null;
          discount_pct?: number | null;
          original_price?: number | null;
          deal_price?: number | null;
          currency?: string;
          source?: string | null;
          url?: string;
          starts_at?: string;
          expires_at?: string | null;
          is_active?: boolean;
          is_featured?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "deals_site_id_fkey";
            columns: ["site_id"];
            isOneToOne: false;
            referencedRelation: "sites";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "deals_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
        ];
      };

      // ── Migration 00050: community UGC ───────────────────────────────

      wrist_shots: {
        Row: {
          id: string;
          site_id: string;
          product_id: string | null;
          user_email: string;
          user_name: string;
          image_url: string;
          caption: string | null;
          status: string;
          approved_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          site_id: string;
          product_id?: string | null;
          user_email: string;
          user_name: string;
          image_url: string;
          caption?: string | null;
          status?: string;
          approved_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          site_id?: string;
          product_id?: string | null;
          user_email?: string;
          user_name?: string;
          image_url?: string;
          caption?: string | null;
          status?: string;
          approved_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "wrist_shots_site_id_fkey";
            columns: ["site_id"];
            isOneToOne: false;
            referencedRelation: "sites";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "wrist_shots_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
        ];
      };

      comments: {
        Row: {
          id: string;
          site_id: string;
          target_type: string;
          target_id: string;
          parent_id: string | null;
          user_email: string;
          user_name: string;
          body: string;
          status: string;
          approved_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          site_id: string;
          target_type: string;
          target_id: string;
          parent_id?: string | null;
          user_email: string;
          user_name: string;
          body: string;
          status?: string;
          approved_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          site_id?: string;
          target_type?: string;
          target_id?: string;
          parent_id?: string | null;
          user_email?: string;
          user_name?: string;
          body?: string;
          status?: string;
          approved_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "comments_site_id_fkey";
            columns: ["site_id"];
            isOneToOne: false;
            referencedRelation: "sites";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "comments_parent_id_fkey";
            columns: ["parent_id"];
            isOneToOne: false;
            referencedRelation: "comments";
            referencedColumns: ["id"];
          },
        ];
      };

      // ── Migration 00051: memberships ─────────────────────────────────

      memberships: {
        Row: {
          id: string;
          site_id: string;
          email: string;
          name: string | null;
          tier: string;
          status: string;
          stripe_customer_id: string | null;
          stripe_subscription_id: string | null;
          current_period_start: string | null;
          current_period_end: string | null;
          cancelled_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          site_id: string;
          email: string;
          name?: string | null;
          tier?: string;
          status?: string;
          stripe_customer_id?: string | null;
          stripe_subscription_id?: string | null;
          current_period_start?: string | null;
          current_period_end?: string | null;
          cancelled_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          site_id?: string;
          email?: string;
          name?: string | null;
          tier?: string;
          status?: string;
          stripe_customer_id?: string | null;
          stripe_subscription_id?: string | null;
          current_period_start?: string | null;
          current_period_end?: string | null;
          cancelled_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "memberships_site_id_fkey";
            columns: ["site_id"];
            isOneToOne: false;
            referencedRelation: "sites";
            referencedColumns: ["id"];
          },
        ];
      };

      // ── Migration 00052: A/B testing ─────────────────────────────────

      experiments: {
        Row: {
          id: string;
          site_id: string;
          name: string;
          slug: string;
          description: string | null;
          variants: unknown;
          status: string;
          started_at: string | null;
          ended_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          site_id: string;
          name: string;
          slug: string;
          description?: string | null;
          variants?: unknown;
          status?: string;
          started_at?: string | null;
          ended_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          site_id?: string;
          name?: string;
          slug?: string;
          description?: string | null;
          variants?: unknown;
          status?: string;
          started_at?: string | null;
          ended_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "experiments_site_id_fkey";
            columns: ["site_id"];
            isOneToOne: false;
            referencedRelation: "sites";
            referencedColumns: ["id"];
          },
        ];
      };

      experiment_assignments: {
        Row: {
          id: string;
          experiment_id: string;
          visitor_id: string;
          variant_id: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          experiment_id: string;
          visitor_id: string;
          variant_id: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          experiment_id?: string;
          visitor_id?: string;
          variant_id?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "experiment_assignments_experiment_id_fkey";
            columns: ["experiment_id"];
            isOneToOne: false;
            referencedRelation: "experiments";
            referencedColumns: ["id"];
          },
        ];
      };

      experiment_events: {
        Row: {
          id: string;
          experiment_id: string;
          visitor_id: string;
          variant_id: string;
          event_type: string;
          metadata: unknown | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          experiment_id: string;
          visitor_id: string;
          variant_id: string;
          event_type: string;
          metadata?: unknown | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          experiment_id?: string;
          visitor_id?: string;
          variant_id?: string;
          event_type?: string;
          metadata?: unknown | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "experiment_events_experiment_id_fkey";
            columns: ["experiment_id"];
            isOneToOne: false;
            referencedRelation: "experiments";
            referencedColumns: ["id"];
          },
        ];
      };

      // ── Migration 00054: Stripe events ───────────────────────────────

      stripe_events: {
        Row: {
          stripe_event_id: string;
          event_type: string;
          received_at: string;
          /** Migration 00081 (S-06): server-side insert timestamp. */
          created_at: string;
        };
        Insert: {
          stripe_event_id: string;
          event_type: string;
          received_at?: string;
          created_at?: string;
        };
        Update: {
          stripe_event_id?: string;
          event_type?: string;
          received_at?: string;
          created_at?: string;
        };
        Relationships: [];
      };

      click_failures: {
        Row: {
          id: string;
          payload: Record<string, unknown>;
          error_message: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          payload: Record<string, unknown>;
          error_message?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          payload?: Record<string, unknown>;
          error_message?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };

      subject_restrictions: {
        Row: {
          id: string;
          site_id: string;
          email: string;
          restricted_at: string;
          reason: string | null;
          lifted_at: string | null;
          created_by: string;
        };
        Insert: {
          id?: string;
          site_id: string;
          email: string;
          restricted_at?: string;
          reason?: string | null;
          lifted_at?: string | null;
          created_by: string;
        };
        Update: {
          id?: string;
          site_id?: string;
          email?: string;
          restricted_at?: string;
          reason?: string | null;
          lifted_at?: string | null;
          created_by?: string;
        };
        Relationships: [];
      };

      cron_state: {
        Row: {
          job_name: string;
          last_processed_at: string | null;
          last_id: string | null;
          cursor: Record<string, unknown>;
          updated_at: string;
        };
        Insert: {
          job_name: string;
          last_processed_at?: string | null;
          last_id?: string | null;
          cursor?: Record<string, unknown>;
          updated_at?: string;
        };
        Update: {
          job_name?: string;
          last_processed_at?: string | null;
          last_id?: string | null;
          cursor?: Record<string, unknown>;
          updated_at?: string;
        };
        Relationships: [];
      };

      consent_log: {
        Row: {
          id: number;
          site_id: string;
          subject_id: string | null;
          categories: string[];
          banner_version: string;
          gpc: boolean;
          ua_hash: string;
          ip_truncated: string;
          created_at: string;
        };
        Insert: {
          id?: number;
          site_id: string;
          subject_id?: string | null;
          categories: string[];
          banner_version: string;
          gpc?: boolean;
          ua_hash: string;
          ip_truncated: string;
          created_at?: string;
        };
        Update: {
          id?: number;
          site_id?: string;
          subject_id?: string | null;
          categories?: string[];
          banner_version?: string;
          gpc?: boolean;
          ua_hash?: string;
          ip_truncated?: string;
          created_at?: string;
        };
        Relationships: [];
      };

      webhook_dlq: {
        Row: {
          id: string;
          event_id: string;
          event_type: string;
          payload: Record<string, unknown>;
          error_message: string | null;
          attempts: number;
          status: string;
          created_at: string;
          resolved_at: string | null;
        };
        Insert: {
          id?: string;
          event_id: string;
          event_type: string;
          payload: Record<string, unknown>;
          error_message?: string | null;
          attempts?: number;
          status?: string;
          created_at?: string;
          resolved_at?: string | null;
        };
        Update: {
          id?: string;
          event_id?: string;
          event_type?: string;
          payload?: Record<string, unknown>;
          error_message?: string | null;
          attempts?: number;
          status?: string;
          created_at?: string;
          resolved_at?: string | null;
        };
        Relationships: [];
      };

      stripe_event_failures: {
        Row: {
          id: string;
          event_id: string;
          event_type: string;
          payload: Record<string, unknown>;
          error_message: string | null;
          attempts: number;
          created_at: string;
          resolved_at: string | null;
          resolved_by: string | null;
        };
        Insert: {
          id?: string;
          event_id: string;
          event_type: string;
          payload?: Record<string, unknown>;
          error_message?: string | null;
          attempts?: number;
          created_at?: string;
          resolved_at?: string | null;
          resolved_by?: string | null;
        };
        Update: {
          id?: string;
          event_id?: string;
          event_type?: string;
          payload?: Record<string, unknown>;
          error_message?: string | null;
          attempts?: number;
          created_at?: string;
          resolved_at?: string | null;
          resolved_by?: string | null;
        };
        Relationships: [];
      };
    };

      /** Migration 00084 (S-09): internal migration tracking table. Service-role only. */
      _migrations_applied: {
        Row: Record<string, unknown>;
        Insert: Record<string, unknown>;
        Update: Record<string, unknown>;
        Relationships: [];
      };

      /** Migration 2026050106 (OF-04): server-side consent proof records. */
      consent_log: {
        Row: {
          id: number;
          site_id: string;
          subject_id: string | null;
          categories: string[];
          banner_version: string;
          gpc: boolean;
          ua_hash: string;
          ip_truncated: string;
          created_at: string;
        };
        Insert: {
          id?: number;
          site_id: string;
          subject_id?: string | null;
          categories: string[];
          banner_version: string;
          gpc?: boolean;
          ua_hash: string;
          ip_truncated: string;
          created_at?: string;
        };
        Update: {
          id?: number;
          site_id?: string;
          subject_id?: string | null;
          categories?: string[];
          banner_version?: string;
          gpc?: boolean;
          ua_hash?: string;
          ip_truncated?: string;
          created_at?: string;
        };
        Relationships: [];
      };

      /** Migration 2026050104 (OF-16): unified cron checkpoint table. */
      cron_state: {
        Row: {
          job_name: string;
          last_processed_at: string | null;
          last_id: string | null;
          cursor: Record<string, unknown>;
          updated_at: string;
        };
        Insert: {
          job_name: string;
          last_processed_at?: string | null;
          last_id?: string | null;
          cursor?: Record<string, unknown>;
          updated_at?: string;
        };
        Update: {
          job_name?: string;
          last_processed_at?: string | null;
          last_id?: string | null;
          cursor?: Record<string, unknown>;
          updated_at?: string;
        };
        Relationships: [];
      };

      /** Migration 2026052202 (R-03): durable Stripe webhook DLQ. */
      stripe_event_failures: {
        Row: {
          id: string;
          event_id: string;
          event_type: string;
          payload: Record<string, unknown>;
          error_message: string | null;
          attempts: number;
          created_at: string;
          resolved_at: string | null;
          resolved_by: string | null;
        };
        Insert: {
          id?: string;
          event_id: string;
          event_type: string;
          payload?: Record<string, unknown>;
          error_message?: string | null;
          attempts?: number;
          created_at?: string;
          resolved_at?: string | null;
          resolved_by?: string | null;
        };
        Update: {
          id?: string;
          event_id?: string;
          event_type?: string;
          payload?: Record<string, unknown>;
          error_message?: string | null;
          attempts?: number;
          created_at?: string;
          resolved_at?: string | null;
          resolved_by?: string | null;
        };
        Relationships: [];
      };

      /** Migration 2026050102 (OF-02): GDPR Art. 18 right-to-restriction records. */
      subject_restrictions: {
        Row: {
          id: string;
          site_id: string;
          email: string;
          restricted_at: string;
          reason: string | null;
          lifted_at: string | null;
          created_by: string;
        };
        Insert: {
          id?: string;
          site_id: string;
          email: string;
          restricted_at?: string;
          reason?: string | null;
          lifted_at?: string | null;
          created_by: string;
        };
        Update: {
          id?: string;
          site_id?: string;
          email?: string;
          restricted_at?: string;
          reason?: string | null;
          lifted_at?: string | null;
          created_by?: string;
        };
        Relationships: [];
      };

      /** Migration 2026052203 (R2-02): durable Dead Letter Queue for failed webhook events. */
      webhook_dlq: {
        Row: {
          id: string;
          event_id: string;
          event_type: string;
          payload: Record<string, unknown>;
          error_message: string | null;
          attempts: number;
          status: "pending" | "replayed" | "resolved";
          created_at: string;
          resolved_at: string | null;
        };
        Insert: {
          id?: string;
          event_id: string;
          event_type: string;
          payload: Record<string, unknown>;
          error_message?: string | null;
          attempts?: number;
          status?: "pending" | "replayed" | "resolved";
          created_at?: string;
          resolved_at?: string | null;
        };
        Update: {
          id?: string;
          event_id?: string;
          event_type?: string;
          payload?: Record<string, unknown>;
          error_message?: string | null;
          attempts?: number;
          status?: "pending" | "replayed" | "resolved";
          created_at?: string;
          resolved_at?: string | null;
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
      record_ad_impression: {
        Args: {
          p_site_id: string;
          p_ad_placement_id: string;
          p_content_id: string | null;
          p_page_path: string;
          p_cpm_revenue_cents: number;
        };
        Returns: undefined;
      };
      apply_stripe_membership_event: {
        Args: {
          p_stripe_event_id: string;
          p_event_type: string;
          p_event_data: Record<string, unknown>;
        };
        Returns: { duplicate: boolean; membership_id: string | null };
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}

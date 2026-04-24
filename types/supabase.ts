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
          image_alt: string;
          pros: string;
          cons: string;
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
          image_alt?: string;
          pros?: string;
          cons?: string;
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
          image_alt?: string;
          pros?: string;
          cons?: string;
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
          body_previous: string | null;
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
          body_previous?: string | null;
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
          body_previous?: string | null;
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
          action: string;
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
          action: string;
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
          action?: string;
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
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}

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
          created_at: string;
        };
        Insert: {
          id?: string;
          slug: string;
          name: string;
          domain?: string;
          language?: string;
          direction?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          slug?: string;
          name?: string;
          domain?: string;
          language?: string;
          direction?: string;
          created_at?: string;
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
          created_at: string;
        };
        Insert: {
          id?: string;
          site_id: string;
          name: string;
          slug: string;
          description?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          site_id?: string;
          name?: string;
          slug?: string;
          description?: string;
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
    };

    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}

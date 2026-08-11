export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.4";
  };
  public: {
    Tables: {
      access_review_log: {
        Row: {
          id: string;
          reviewed_at: string;
          total_users: number;
          findings_count: number;
          findings: Record<string, unknown>[];
          reviewer: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          reviewed_at?: string;
          total_users: number;
          findings_count?: number;
          findings?: Record<string, unknown>[];
          reviewer?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          reviewed_at?: string;
          total_users?: number;
          findings_count?: number;
          findings?: Record<string, unknown>[];
          reviewer?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      _migrations_applied: {
        Row: {
          applied_at: string;
          filename: string;
        };
        Insert: {
          applied_at?: string;
          filename: string;
        };
        Update: {
          applied_at?: string;
          filename?: string;
        };
        Relationships: [];
      };
      ad_impressions: {
        Row: {
          ad_placement_id: string;
          content_id: string | null;
          cpm_revenue_cents: number | null;
          created_at: string | null;
          id: string;
          impression_count: number | null;
          impression_date: string | null;
          last_seen_at: string | null;
          page_path: string | null;
          site_id: string;
          site_hash: number | null;
        };
        Insert: {
          ad_placement_id: string;
          content_id?: string | null;
          cpm_revenue_cents?: number | null;
          created_at?: string | null;
          id?: string;
          impression_count?: number | null;
          impression_date?: string | null;
          last_seen_at?: string | null;
          page_path?: string | null;
          site_id: string;
        };
        Update: {
          ad_placement_id?: string;
          content_id?: string | null;
          cpm_revenue_cents?: number | null;
          created_at?: string | null;
          id?: string;
          impression_count?: number | null;
          impression_date?: string | null;
          last_seen_at?: string | null;
          page_path?: string | null;
          site_id?: string;
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
            foreignKeyName: "ad_impressions_content_id_fkey";
            columns: ["content_id"];
            isOneToOne: false;
            referencedRelation: "content";
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
      ad_placements: {
        Row: {
          ad_code: string | null;
          config: Json | null;
          created_at: string | null;
          id: string;
          is_active: boolean | null;
          name: string;
          placement_type: string;
          priority: number | null;
          provider: string;
          site_id: string;
        };
        Insert: {
          ad_code?: string | null;
          config?: Json | null;
          created_at?: string | null;
          id?: string;
          is_active?: boolean | null;
          name: string;
          placement_type: string;
          priority?: number | null;
          provider: string;
          site_id: string;
        };
        Update: {
          ad_code?: string | null;
          config?: Json | null;
          created_at?: string | null;
          id?: string;
          is_active?: boolean | null;
          name?: string;
          placement_type?: string;
          priority?: number | null;
          provider?: string;
          site_id?: string;
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
      admin_api_tokens: {
        Row: {
          created_at: string;
          created_by: string;
          expires_at: string;
          id: string;
          is_active: boolean;
          last_used_at: string | null;
          name: string;
          site_id: string | null;
          token_hash: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          created_by: string;
          expires_at: string;
          id?: string;
          is_active?: boolean;
          last_used_at?: string | null;
          name: string;
          site_id?: string | null;
          token_hash: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          created_by?: string;
          expires_at?: string;
          id?: string;
          is_active?: boolean;
          last_used_at?: string | null;
          name?: string;
          site_id?: string | null;
          token_hash?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "admin_api_tokens_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "admin_users";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "admin_api_tokens_site_id_fkey";
            columns: ["site_id"];
            isOneToOne: false;
            referencedRelation: "sites";
            referencedColumns: ["id"];
          },
        ];
      };
      admin_site_memberships: {
        Row: {
          admin_user_id: string;
          created_at: string;
          id: string;
          site_id: string;
        };
        Insert: {
          admin_user_id: string;
          created_at?: string;
          id?: string;
          site_id: string;
        };
        Update: {
          admin_user_id?: string;
          created_at?: string;
          id?: string;
          site_id?: string;
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
      admin_users: {
        Row: {
          created_at: string | null;
          email: string;
          id: string;
          is_active: boolean;
          login_failed_attempts: number;
          login_locked_until: string | null;
          name: string;
          password_hash: string;
          reset_token: string | null;
          reset_token_expires_at: string | null;
          role: string;
          totp_enabled: boolean;
          totp_failed_attempts: number;
          totp_last_step: number | null;
          totp_locked_until: string | null;
          totp_secret: string | null;
          totp_verified_at: string | null;
          updated_at: string | null;
        };
        Insert: {
          created_at?: string | null;
          email: string;
          id?: string;
          is_active?: boolean;
          login_failed_attempts?: number;
          login_locked_until?: string | null;
          name?: string;
          password_hash: string;
          reset_token?: string | null;
          reset_token_expires_at?: string | null;
          role?: string;
          totp_enabled?: boolean;
          totp_failed_attempts?: number;
          totp_last_step?: number | null;
          totp_locked_until?: string | null;
          totp_secret?: string | null;
          totp_verified_at?: string | null;
          updated_at?: string | null;
        };
        Update: {
          created_at?: string | null;
          email?: string;
          id?: string;
          is_active?: boolean;
          login_failed_attempts?: number;
          login_locked_until?: string | null;
          name?: string;
          password_hash?: string;
          reset_token?: string | null;
          reset_token_expires_at?: string | null;
          role?: string;
          totp_enabled?: boolean;
          totp_failed_attempts?: number;
          totp_last_step?: number | null;
          totp_locked_until?: string | null;
          totp_secret?: string | null;
          totp_verified_at?: string | null;
          updated_at?: string | null;
        };
        Relationships: [];
      };
      affiliate_clicks: {
        Row: {
          affiliate_url: string | null;
          click_id: string | null;
          click_ref: string | null;
          content_slug: string | null;
          created_at: string | null;
          fingerprint: string | null;
          id: string;
          ip_prefix: string | null;
          is_internal: boolean | null;
          product_id: string | null;
          product_name: string | null;
          referrer: string | null;
          site_id: string | null;
        };
        Insert: {
          affiliate_url?: string | null;
          click_id?: string | null;
          click_ref?: string | null;
          content_slug?: string | null;
          created_at?: string | null;
          fingerprint?: string | null;
          id?: string;
          ip_prefix?: string | null;
          is_internal?: boolean | null;
          product_id?: string | null;
          product_name?: string | null;
          referrer?: string | null;
          site_id?: string | null;
        };
        Update: {
          affiliate_url?: string | null;
          click_id?: string | null;
          click_ref?: string | null;
          content_slug?: string | null;
          created_at?: string | null;
          fingerprint?: string | null;
          id?: string;
          ip_prefix?: string | null;
          is_internal?: boolean | null;
          product_id?: string | null;
          product_name?: string | null;
          referrer?: string | null;
          site_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "affiliate_clicks_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "fk_affiliate_clicks_site_id";
            columns: ["site_id"];
            isOneToOne: false;
            referencedRelation: "sites";
            referencedColumns: ["id"];
          },
        ];
      };
      affiliate_networks: {
        Row: {
          api_key_ref: string;
          config: Json;
          created_at: string;
          id: string;
          is_active: boolean;
          network: string;
          publisher_id: string;
          site_id: string;
          updated_at: string;
        };
        Insert: {
          api_key_ref?: string;
          config?: Json;
          created_at?: string;
          id?: string;
          is_active?: boolean;
          network: string;
          publisher_id?: string;
          site_id: string;
          updated_at?: string;
        };
        Update: {
          api_key_ref?: string;
          config?: Json;
          created_at?: string;
          id?: string;
          is_active?: boolean;
          network?: string;
          publisher_id?: string;
          site_id?: string;
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
      affiliate_tracking_keys: {
        Row: {
          created_at: string;
          network: string;
          site_id: string;
          tracking_key: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          network: string;
          site_id: string;
          tracking_key: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          network?: string;
          site_id?: string;
          tracking_key?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "affiliate_tracking_keys_site_id_fkey";
            columns: ["site_id"];
            isOneToOne: false;
            referencedRelation: "sites";
            referencedColumns: ["id"];
          },
        ];
      };
      ai_drafts: {
        Row: {
          ai_model: string;
          ai_provider: string;
          body: string;
          content_type: string;
          created_at: string;
          excerpt: string;
          generated_at: string;
          id: string;
          keywords: string[];
          meta_description: string | null;
          meta_title: string | null;
          reviewed_at: string | null;
          reviewed_by: string | null;
          site_id: string;
          slug: string;
          status: string;
          title: string;
          topic: string;
          updated_at: string;
        };
        Insert: {
          ai_model?: string;
          ai_provider?: string;
          body?: string;
          content_type?: string;
          created_at?: string;
          excerpt?: string;
          generated_at?: string;
          id?: string;
          keywords?: string[];
          meta_description?: string | null;
          meta_title?: string | null;
          reviewed_at?: string | null;
          reviewed_by?: string | null;
          site_id: string;
          slug: string;
          status?: string;
          title: string;
          topic?: string;
          updated_at?: string;
        };
        Update: {
          ai_model?: string;
          ai_provider?: string;
          body?: string;
          content_type?: string;
          created_at?: string;
          excerpt?: string;
          generated_at?: string;
          id?: string;
          keywords?: string[];
          meta_description?: string | null;
          meta_title?: string | null;
          reviewed_at?: string | null;
          reviewed_by?: string | null;
          site_id?: string;
          slug?: string;
          status?: string;
          title?: string;
          topic?: string;
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
      audit_log: {
        Row: {
          action: string;
          actor: string;
          actor_user_id: string | null;
          created_at: string | null;
          details: Json | null;
          entity_id: string | null;
          entity_type: string;
          id: string;
          ip: string | null;
          site_id: string;
        };
        Insert: {
          action: string;
          actor?: string;
          actor_user_id?: string | null;
          created_at?: string | null;
          details?: Json | null;
          entity_id?: string | null;
          entity_type: string;
          id?: string;
          ip?: string | null;
          site_id: string;
        };
        Update: {
          action?: string;
          actor?: string;
          actor_user_id?: string | null;
          created_at?: string | null;
          details?: Json | null;
          entity_id?: string | null;
          entity_type?: string;
          id?: string;
          ip?: string | null;
          site_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "audit_log_actor_user_id_fkey";
            columns: ["actor_user_id"];
            isOneToOne: false;
            referencedRelation: "admin_users";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "audit_log_site_id_fkey";
            columns: ["site_id"];
            isOneToOne: false;
            referencedRelation: "sites";
            referencedColumns: ["id"];
          },
        ];
      };
      automation_actions: {
        Row: Record<string, any>;
        Insert: Record<string, any>;
        Update: Record<string, any>;
        Relationships: [];
      };
      automation_policies: {
        Row: Record<string, any>;
        Insert: Record<string, any>;
        Update: Record<string, any>;
        Relationships: [];
      };
      automation_runs: {
        Row: Record<string, any>;
        Insert: Record<string, any>;
        Update: Record<string, any>;
        Relationships: [];
      };
      automation_service_accounts: {
        Row: Record<string, any>;
        Insert: Record<string, any>;
        Update: Record<string, any>;
        Relationships: [];
      };
      automation_tokens: {
        Row: Record<string, any>;
        Insert: Record<string, any>;
        Update: Record<string, any>;
        Relationships: [];
      };
      authors: {
        Row: {
          bio: string;
          created_at: string;
          credentials: string;
          expertise: string[];
          id: string;
          is_active: boolean;
          name: string;
          photo_url: string;
          site_id: string;
          slug: string;
          social_links: Json;
          updated_at: string;
        };
        Insert: {
          bio?: string;
          created_at?: string;
          credentials?: string;
          expertise?: string[];
          id?: string;
          is_active?: boolean;
          name: string;
          photo_url?: string;
          site_id: string;
          slug: string;
          social_links?: Json;
          updated_at?: string;
        };
        Update: {
          bio?: string;
          created_at?: string;
          credentials?: string;
          expertise?: string[];
          id?: string;
          is_active?: boolean;
          name?: string;
          photo_url?: string;
          site_id?: string;
          slug?: string;
          social_links?: Json;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "authors_site_id_fkey";
            columns: ["site_id"];
            isOneToOne: false;
            referencedRelation: "sites";
            referencedColumns: ["id"];
          },
        ];
      };
      categories: {
        Row: {
          created_at: string | null;
          description: string | null;
          id: string;
          meta_description: string | null;
          meta_title: string | null;
          name: string;
          site_id: string;
          slug: string;
          taxonomy_type: string;
        };
        Insert: {
          created_at?: string | null;
          description?: string | null;
          id?: string;
          meta_description?: string | null;
          meta_title?: string | null;
          name: string;
          site_id: string;
          slug: string;
          taxonomy_type?: string;
        };
        Update: {
          created_at?: string | null;
          description?: string | null;
          id?: string;
          meta_description?: string | null;
          meta_title?: string | null;
          name?: string;
          site_id?: string;
          slug?: string;
          taxonomy_type?: string;
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
      click_failures: {
        Row: {
          created_at: string;
          error_message: string | null;
          id: string;
          payload: Json;
        };
        Insert: {
          created_at?: string;
          error_message?: string | null;
          id?: string;
          payload: Json;
        };
        Update: {
          created_at?: string;
          error_message?: string | null;
          id?: string;
          payload?: Json;
        };
        Relationships: [];
      };
      comments: {
        Row: {
          approved_at: string | null;
          body: string;
          created_at: string;
          id: string;
          parent_id: string | null;
          site_id: string;
          status: string;
          target_id: string;
          target_type: string;
          updated_at: string;
          user_email: string;
          user_name: string;
        };
        Insert: {
          approved_at?: string | null;
          body: string;
          created_at?: string;
          id?: string;
          parent_id?: string | null;
          site_id: string;
          status?: string;
          target_id: string;
          target_type: string;
          updated_at?: string;
          user_email: string;
          user_name: string;
        };
        Update: {
          approved_at?: string | null;
          body?: string;
          created_at?: string;
          id?: string;
          parent_id?: string | null;
          site_id?: string;
          status?: string;
          target_id?: string;
          target_type?: string;
          updated_at?: string;
          user_email?: string;
          user_name?: string;
        };
        Relationships: [
          {
            foreignKeyName: "comments_parent_id_fkey";
            columns: ["parent_id"];
            isOneToOne: false;
            referencedRelation: "comments";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "comments_site_id_fkey";
            columns: ["site_id"];
            isOneToOne: false;
            referencedRelation: "sites";
            referencedColumns: ["id"];
          },
        ];
      };
      commissions: {
        Row: {
          click_id: string | null;
          commission_amount: number;
          created_at: string;
          currency: string;
          customer_country: string | null;
          event_date: string;
          id: string;
          ingested_at: string;
          items_count: number | null;
          network: string;
          network_sale_amount: number | null;
          network_status: string | null;
          network_transaction_id: string | null;
          order_id: string | null;
          product_id: string | null;
          raw_data: Json | null;
          sale_amount: number | null;
          site_id: string;
          status: string;
        };
        Insert: {
          click_id?: string | null;
          commission_amount: number;
          created_at?: string;
          currency?: string;
          customer_country?: string | null;
          event_date: string;
          id?: string;
          ingested_at?: string;
          items_count?: number | null;
          network: string;
          network_sale_amount?: number | null;
          network_status?: string | null;
          network_transaction_id?: string | null;
          order_id?: string | null;
          product_id?: string | null;
          raw_data?: Json | null;
          sale_amount?: number | null;
          site_id: string;
          status?: string;
        };
        Update: {
          click_id?: string | null;
          commission_amount?: number;
          created_at?: string;
          currency?: string;
          customer_country?: string | null;
          event_date?: string;
          id?: string;
          ingested_at?: string;
          items_count?: number | null;
          network?: string;
          network_sale_amount?: number | null;
          network_status?: string | null;
          network_transaction_id?: string | null;
          order_id?: string | null;
          product_id?: string | null;
          raw_data?: Json | null;
          sale_amount?: number | null;
          site_id?: string;
          status?: string;
        };
        Relationships: [
          {
            foreignKeyName: "commissions_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "commissions_site_id_fkey";
            columns: ["site_id"];
            isOneToOne: false;
            referencedRelation: "sites";
            referencedColumns: ["id"];
          },
        ];
      };
      consent_log: {
        Row: {
          banner_version: string;
          categories: string[];
          created_at: string;
          gpc: boolean;
          id: number;
          ip_truncated: string;
          site_id: string;
          subject_id: string | null;
          ua_hash: string;
        };
        Insert: {
          banner_version: string;
          categories: string[];
          created_at?: string;
          gpc?: boolean;
          id?: number;
          ip_truncated: string;
          site_id: string;
          subject_id?: string | null;
          ua_hash: string;
        };
        Update: {
          banner_version?: string;
          categories?: string[];
          created_at?: string;
          gpc?: boolean;
          id?: number;
          ip_truncated?: string;
          site_id?: string;
          subject_id?: string | null;
          ua_hash?: string;
        };
        Relationships: [];
      };
      content: {
        Row: {
          author: string | null;
          author_id: string | null;
          ai_generated: boolean;
          body: string | null;
          body_previous: string | null;
          category_id: string | null;
          created_at: string | null;
          excerpt: string | null;
          featured_image: string | null;
          human_reviewed_at: string | null;
          id: string;
          meta_description: string | null;
          meta_title: string | null;
          og_image: string | null;
          publish_at: string | null;
          review_state: string;
          site_id: string;
          slug: string;
          status: string;
          tags: string[] | null;
          title: string;
          type: string;
          updated_at: string | null;
        };
        Insert: {
          author?: string | null;
          author_id?: string | null;
          ai_generated?: boolean;
          body?: string | null;
          body_previous?: string | null;
          category_id?: string | null;
          created_at?: string | null;
          excerpt?: string | null;
          featured_image?: string | null;
          human_reviewed_at?: string | null;
          id?: string;
          meta_description?: string | null;
          meta_title?: string | null;
          og_image?: string | null;
          publish_at?: string | null;
          review_state?: string;
          site_id: string;
          slug: string;
          status?: string;
          tags?: string[] | null;
          title: string;
          type?: string;
          updated_at?: string | null;
        };
        Update: {
          author?: string | null;
          author_id?: string | null;
          ai_generated?: boolean;
          body?: string | null;
          body_previous?: string | null;
          category_id?: string | null;
          created_at?: string | null;
          excerpt?: string | null;
          featured_image?: string | null;
          human_reviewed_at?: string | null;
          id?: string;
          meta_description?: string | null;
          meta_title?: string | null;
          og_image?: string | null;
          publish_at?: string | null;
          review_state?: string;
          site_id?: string;
          slug?: string;
          status?: string;
          tags?: string[] | null;
          title?: string;
          type?: string;
          updated_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "content_author_id_fkey";
            columns: ["author_id"];
            isOneToOne: false;
            referencedRelation: "authors";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "content_category_id_fkey";
            columns: ["category_id"];
            isOneToOne: false;
            referencedRelation: "categories";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "content_site_id_fkey";
            columns: ["site_id"];
            isOneToOne: false;
            referencedRelation: "sites";
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
      contact_submissions: {
        Row: {
          created_at: string;
          email: string;
          id: string;
          message: string;
          name: string | null;
          site_id: string;
          subject: string | null;
        };
        Insert: {
          created_at?: string;
          email: string;
          id?: string;
          message: string;
          name?: string | null;
          site_id: string;
          subject?: string | null;
        };
        Update: {
          created_at?: string;
          email?: string;
          id?: string;
          message?: string;
          name?: string | null;
          site_id?: string;
          subject?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "contact_submissions_site_id_fkey";
            columns: ["site_id"];
            isOneToOne: false;
            referencedRelation: "sites";
            referencedColumns: ["id"];
          },
        ];
      };
      cron_state: {
        Row: {
          cursor: Json;
          job_name: string;
          last_id: string | null;
          last_processed_at: string | null;
          updated_at: string;
        };
        Insert: {
          cursor?: Json;
          job_name: string;
          last_id?: string | null;
          last_processed_at?: string | null;
          updated_at?: string;
        };
        Update: {
          cursor?: Json;
          job_name?: string;
          last_id?: string | null;
          last_processed_at?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      deals: {
        Row: {
          created_at: string;
          currency: string;
          deal_price: number | null;
          description: string | null;
          discount_pct: number | null;
          expires_at: string | null;
          id: string;
          is_active: boolean;
          is_featured: boolean;
          original_price: number | null;
          product_id: string | null;
          site_id: string;
          source: string | null;
          starts_at: string;
          title: string;
          updated_at: string;
          url: string;
        };
        Insert: {
          created_at?: string;
          currency?: string;
          deal_price?: number | null;
          description?: string | null;
          discount_pct?: number | null;
          expires_at?: string | null;
          id?: string;
          is_active?: boolean;
          is_featured?: boolean;
          original_price?: number | null;
          product_id?: string | null;
          site_id: string;
          source?: string | null;
          starts_at?: string;
          title: string;
          updated_at?: string;
          url: string;
        };
        Update: {
          created_at?: string;
          currency?: string;
          deal_price?: number | null;
          description?: string | null;
          discount_pct?: number | null;
          expires_at?: string | null;
          id?: string;
          is_active?: boolean;
          is_featured?: boolean;
          original_price?: number | null;
          product_id?: string | null;
          site_id?: string;
          source?: string | null;
          starts_at?: string;
          title?: string;
          updated_at?: string;
          url?: string;
        };
        Relationships: [
          {
            foreignKeyName: "deals_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "deals_site_id_fkey";
            columns: ["site_id"];
            isOneToOne: false;
            referencedRelation: "sites";
            referencedColumns: ["id"];
          },
        ];
      };
      drip_campaigns: {
        Row: {
          created_at: string;
          id: string;
          is_active: boolean;
          name: string;
          site_id: string;
          steps: Json;
          trigger_quiz_id: string | null;
          trigger_type: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          is_active?: boolean;
          name: string;
          site_id: string;
          steps?: Json;
          trigger_quiz_id?: string | null;
          trigger_type?: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          is_active?: boolean;
          name?: string;
          site_id?: string;
          steps?: Json;
          trigger_quiz_id?: string | null;
          trigger_type?: string;
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
          campaign_id: string;
          created_at: string;
          current_step: number;
          email: string;
          id: string;
          metadata: Json;
          next_send_at: string | null;
          status: string;
          updated_at: string;
        };
        Insert: {
          campaign_id: string;
          created_at?: string;
          current_step?: number;
          email: string;
          id?: string;
          metadata?: Json;
          next_send_at?: string | null;
          status?: string;
          updated_at?: string;
        };
        Update: {
          campaign_id?: string;
          created_at?: string;
          current_step?: number;
          email?: string;
          id?: string;
          metadata?: Json;
          next_send_at?: string | null;
          status?: string;
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
      experiment_assignments: {
        Row: {
          created_at: string;
          experiment_id: string;
          id: string;
          variant_id: string;
          visitor_id: string;
        };
        Insert: {
          created_at?: string;
          experiment_id: string;
          id?: string;
          variant_id: string;
          visitor_id: string;
        };
        Update: {
          created_at?: string;
          experiment_id?: string;
          id?: string;
          variant_id?: string;
          visitor_id?: string;
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
          created_at: string;
          event_type: string;
          experiment_id: string;
          id: string;
          metadata: Json | null;
          variant_id: string;
          visitor_id: string;
        };
        Insert: {
          created_at?: string;
          event_type: string;
          experiment_id: string;
          id?: string;
          metadata?: Json | null;
          variant_id: string;
          visitor_id: string;
        };
        Update: {
          created_at?: string;
          event_type?: string;
          experiment_id?: string;
          id?: string;
          metadata?: Json | null;
          variant_id?: string;
          visitor_id?: string;
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
      experiments: {
        Row: {
          created_at: string;
          description: string | null;
          ended_at: string | null;
          id: string;
          name: string;
          site_id: string;
          slug: string;
          started_at: string | null;
          status: string;
          updated_at: string;
          variants: Json;
        };
        Insert: {
          created_at?: string;
          description?: string | null;
          ended_at?: string | null;
          id?: string;
          name: string;
          site_id: string;
          slug: string;
          started_at?: string | null;
          status?: string;
          updated_at?: string;
          variants?: Json;
        };
        Update: {
          created_at?: string;
          description?: string | null;
          ended_at?: string | null;
          id?: string;
          name?: string;
          site_id?: string;
          slug?: string;
          started_at?: string | null;
          status?: string;
          updated_at?: string;
          variants?: Json;
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
      integration_providers: {
        Row: {
          category: string;
          config_schema: Json;
          created_at: string;
          description: string;
          id: string;
          is_builtin: boolean;
          key: string;
          name: string;
        };
        Insert: {
          category: string;
          config_schema?: Json;
          created_at?: string;
          description?: string;
          id?: string;
          is_builtin?: boolean;
          key: string;
          name: string;
        };
        Update: {
          category?: string;
          config_schema?: Json;
          created_at?: string;
          description?: string;
          id?: string;
          is_builtin?: boolean;
          key?: string;
          name?: string;
        };
        Relationships: [];
      };
      memberships: {
        Row: {
          cancelled_at: string | null;
          created_at: string;
          current_period_end: string | null;
          current_period_start: string | null;
          email: string;
          id: string;
          name: string | null;
          site_id: string;
          status: string;
          stripe_customer_id: string | null;
          stripe_subscription_id: string | null;
          tier: string;
          updated_at: string;
        };
        Insert: {
          cancelled_at?: string | null;
          created_at?: string;
          current_period_end?: string | null;
          current_period_start?: string | null;
          email: string;
          id?: string;
          name?: string | null;
          site_id: string;
          status?: string;
          stripe_customer_id?: string | null;
          stripe_subscription_id?: string | null;
          tier?: string;
          updated_at?: string;
        };
        Update: {
          cancelled_at?: string | null;
          created_at?: string;
          current_period_end?: string | null;
          current_period_start?: string | null;
          email?: string;
          id?: string;
          name?: string | null;
          site_id?: string;
          status?: string;
          stripe_customer_id?: string | null;
          stripe_subscription_id?: string | null;
          tier?: string;
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
      media: {
        Row: Record<string, any>;
        Insert: Record<string, any>;
        Update: Record<string, any>;
        Relationships: [];
      };
      newsletter_subscribers: {
        Row: {
          confirmation_token: string | null;
          confirmed_at: string | null;
          created_at: string | null;
          email: string;
          id: string;
          site_id: string;
          status: string;
          unsubscribe_token: string | null;
        };
        Insert: {
          confirmation_token?: string | null;
          confirmed_at?: string | null;
          created_at?: string | null;
          email: string;
          id?: string;
          site_id: string;
          status?: string;
          unsubscribe_token?: string | null;
        };
        Update: {
          confirmation_token?: string | null;
          confirmed_at?: string | null;
          created_at?: string | null;
          email?: string;
          id?: string;
          site_id?: string;
          status?: string;
          unsubscribe_token?: string | null;
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
      niche_templates: {
        Row: {
          created_at: string | null;
          default_features: Json | null;
          default_footer: Json | null;
          default_nav: Json | null;
          default_theme: Json | null;
          description: string | null;
          direction: string | null;
          homepage_template: string;
          id: string;
          is_builtin: boolean | null;
          language: string | null;
          monetization_type: string | null;
          name: string;
          product_card_style: string;
          slug: string;
          social_links: Json | null;
          updated_at: string | null;
        };
        Insert: {
          created_at?: string | null;
          default_features?: Json | null;
          default_footer?: Json | null;
          default_nav?: Json | null;
          default_theme?: Json | null;
          description?: string | null;
          direction?: string | null;
          homepage_template?: string;
          id?: string;
          is_builtin?: boolean | null;
          language?: string | null;
          monetization_type?: string | null;
          name: string;
          product_card_style?: string;
          slug: string;
          social_links?: Json | null;
          updated_at?: string | null;
        };
        Update: {
          created_at?: string | null;
          default_features?: Json | null;
          default_footer?: Json | null;
          default_nav?: Json | null;
          default_theme?: Json | null;
          description?: string | null;
          direction?: string | null;
          homepage_template?: string;
          id?: string;
          is_builtin?: boolean | null;
          language?: string | null;
          monetization_type?: string | null;
          name?: string;
          product_card_style?: string;
          slug?: string;
          social_links?: Json | null;
          updated_at?: string | null;
        };
        Relationships: [];
      };
      pages: {
        Row: {
          body: string | null;
          created_at: string | null;
          id: string;
          is_published: boolean | null;
          site_id: string;
          slug: string;
          sort_order: number | null;
          title: string;
          updated_at: string | null;
        };
        Insert: {
          body?: string | null;
          created_at?: string | null;
          id?: string;
          is_published?: boolean | null;
          site_id: string;
          slug: string;
          sort_order?: number | null;
          title: string;
          updated_at?: string | null;
        };
        Update: {
          body?: string | null;
          created_at?: string | null;
          id?: string;
          is_published?: boolean | null;
          site_id?: string;
          slug?: string;
          sort_order?: number | null;
          title?: string;
          updated_at?: string | null;
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
      permissions: {
        Row: {
          action: string;
          description: string;
          feature: string;
          id: string;
        };
        Insert: {
          action: string;
          description?: string;
          feature: string;
          id?: string;
        };
        Update: {
          action?: string;
          description?: string;
          feature?: string;
          id?: string;
        };
        Relationships: [];
      };
      price_alerts: {
        Row: {
          created_at: string;
          currency: string;
          email: string;
          id: string;
          is_active: boolean;
          product_id: string;
          site_id: string;
          target_price: number;
          triggered_at: string | null;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          currency?: string;
          email: string;
          id?: string;
          is_active?: boolean;
          product_id: string;
          site_id: string;
          target_price: number;
          triggered_at?: string | null;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          currency?: string;
          email?: string;
          id?: string;
          is_active?: boolean;
          product_id?: string;
          site_id?: string;
          target_price?: number;
          triggered_at?: string | null;
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
      price_snapshots: {
        Row: {
          created_at: string;
          currency: string;
          id: string;
          price_amount: number;
          product_id: string;
          scraped_at: string;
          site_id: string;
          snapshot_date: string;
          source: string;
        };
        Insert: {
          created_at?: string;
          currency?: string;
          id?: string;
          price_amount: number;
          product_id: string;
          scraped_at?: string;
          site_id: string;
          snapshot_date?: string;
          source?: string;
        };
        Update: {
          created_at?: string;
          currency?: string;
          id?: string;
          price_amount?: number;
          product_id?: string;
          scraped_at?: string;
          site_id?: string;
          snapshot_date?: string;
          source?: string;
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
      product_affiliate_links: {
        Row: {
          created_at: string;
          geo: string;
          id: string;
          is_active: boolean;
          network: string;
          product_id: string;
          updated_at: string;
          url: string;
          weight: number;
        };
        Insert: {
          created_at?: string;
          geo?: string;
          id?: string;
          is_active?: boolean;
          network?: string;
          product_id: string;
          updated_at?: string;
          url: string;
          weight?: number;
        };
        Update: {
          created_at?: string;
          geo?: string;
          id?: string;
          is_active?: boolean;
          network?: string;
          product_id?: string;
          updated_at?: string;
          url?: string;
          weight?: number;
        };
        Relationships: [
          {
            foreignKeyName: "product_affiliate_links_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
        ];
      };
      product_epc_stats: {
        Row: {
          clicks_30d: number;
          clicks_7d: number;
          commissions_30d: number;
          commissions_7d: number;
          epc_30d: number;
          epc_7d: number;
          id: string;
          network: string;
          product_id: string;
          site_id: string;
          updated_at: string;
        };
        Insert: {
          clicks_30d?: number;
          clicks_7d?: number;
          commissions_30d?: number;
          commissions_7d?: number;
          epc_30d?: number;
          epc_7d?: number;
          id?: string;
          network: string;
          product_id: string;
          site_id: string;
          updated_at?: string;
        };
        Update: {
          clicks_30d?: number;
          clicks_7d?: number;
          commissions_30d?: number;
          commissions_7d?: number;
          epc_30d?: number;
          epc_7d?: number;
          id?: string;
          network?: string;
          product_id?: string;
          site_id?: string;
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
          {
            foreignKeyName: "product_epc_stats_site_id_fkey";
            columns: ["site_id"];
            isOneToOne: false;
            referencedRelation: "sites";
            referencedColumns: ["id"];
          },
        ];
      };
      products: {
        Row: {
          affiliate_url: string | null;
          category_id: string | null;
          category_ids: string[] | null;
          cons: string | null;
          created_at: string | null;
          cta_text: string | null;
          deal_expires_at: string | null;
          deal_text: string | null;
          description: string | null;
          featured: boolean;
          id: string;
          image_alt: string | null;
          image_url: string | null;
          merchant: string | null;
          name: string;
          price_amount: number | null;
          price_currency: string | null;
          price_label: string | null;
          pros: string | null;
          score: number | null;
          site_id: string;
          slug: string;
          status: string;
          updated_at: string | null;
          version: number;
        };
        Insert: {
          affiliate_url?: string | null;
          category_id?: string | null;
          category_ids?: string[] | null;
          cons?: string | null;
          created_at?: string | null;
          cta_text?: string | null;
          deal_expires_at?: string | null;
          deal_text?: string | null;
          description?: string | null;
          featured?: boolean;
          id?: string;
          image_alt?: string | null;
          image_url?: string | null;
          merchant?: string | null;
          name: string;
          price_amount?: number | null;
          price_currency?: string | null;
          price_label?: string | null;
          pros?: string | null;
          score?: number | null;
          site_id: string;
          slug: string;
          status?: string;
          updated_at?: string | null;
          version?: number;
        };
        Update: {
          affiliate_url?: string | null;
          category_id?: string | null;
          category_ids?: string[] | null;
          cons?: string | null;
          created_at?: string | null;
          cta_text?: string | null;
          deal_expires_at?: string | null;
          deal_text?: string | null;
          description?: string | null;
          featured?: boolean;
          id?: string;
          image_alt?: string | null;
          image_url?: string | null;
          merchant?: string | null;
          name?: string;
          price_amount?: number | null;
          price_currency?: string | null;
          price_label?: string | null;
          pros?: string | null;
          score?: number | null;
          site_id?: string;
          slug?: string;
          status?: string;
          updated_at?: string | null;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: "products_category_id_fkey";
            columns: ["category_id"];
            isOneToOne: false;
            referencedRelation: "categories";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "products_site_id_fkey";
            columns: ["site_id"];
            isOneToOne: false;
            referencedRelation: "sites";
            referencedColumns: ["id"];
          },
        ];
      };
      quiz_submissions: {
        Row: {
          answers: Json;
          completed_at: string | null;
          created_at: string;
          email: string | null;
          id: string;
          quiz_id: string;
          result_tags: string[];
          session_id: string | null;
          site_id: string;
          status: string;
          updated_at: string;
        };
        Insert: {
          answers?: Json;
          completed_at?: string | null;
          created_at?: string;
          email?: string | null;
          id?: string;
          quiz_id: string;
          result_tags?: string[];
          session_id?: string | null;
          site_id: string;
          status?: string;
          updated_at?: string;
        };
        Update: {
          answers?: Json;
          completed_at?: string | null;
          created_at?: string;
          email?: string | null;
          id?: string;
          quiz_id?: string;
          result_tags?: string[];
          session_id?: string | null;
          site_id?: string;
          status?: string;
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
      quizzes: {
        Row: {
          created_at: string;
          description: string | null;
          id: string;
          is_active: boolean;
          result_config: Json;
          site_id: string;
          slug: string;
          steps: Json;
          title: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          description?: string | null;
          id?: string;
          is_active?: boolean;
          result_config?: Json;
          site_id: string;
          slug: string;
          steps?: Json;
          title: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          description?: string | null;
          id?: string;
          is_active?: boolean;
          result_config?: Json;
          site_id?: string;
          slug?: string;
          steps?: Json;
          title?: string;
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
      role_permissions: {
        Row: {
          permission_id: string;
          role_id: string;
        };
        Insert: {
          permission_id: string;
          role_id: string;
        };
        Update: {
          permission_id?: string;
          role_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "role_permissions_permission_id_fkey";
            columns: ["permission_id"];
            isOneToOne: false;
            referencedRelation: "permissions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "role_permissions_role_id_fkey";
            columns: ["role_id"];
            isOneToOne: false;
            referencedRelation: "roles";
            referencedColumns: ["id"];
          },
        ];
      };
      roles: {
        Row: {
          created_at: string;
          description: string;
          id: string;
          is_system: boolean;
          label: string;
          name: string;
        };
        Insert: {
          created_at?: string;
          description?: string;
          id?: string;
          is_system?: boolean;
          label: string;
          name: string;
        };
        Update: {
          created_at?: string;
          description?: string;
          id?: string;
          is_system?: boolean;
          label?: string;
          name?: string;
        };
        Relationships: [];
      };
      site_presentations: {
        Row: Record<string, any>;
        Insert: Record<string, any>;
        Update: Record<string, any>;
        Relationships: [];
      };
      scheduled_jobs: {
        Row: {
          created_at: string | null;
          error: string | null;
          executed_at: string | null;
          id: string;
          job_type: string;
          payload: Json | null;
          scheduled_for: string;
          site_id: string;
          status: string;
          target_id: string;
        };
        Insert: {
          created_at?: string | null;
          error?: string | null;
          executed_at?: string | null;
          id?: string;
          job_type: string;
          payload?: Json | null;
          scheduled_for: string;
          site_id: string;
          status?: string;
          target_id: string;
        };
        Update: {
          created_at?: string | null;
          error?: string | null;
          executed_at?: string | null;
          id?: string;
          job_type?: string;
          payload?: Json | null;
          scheduled_for?: string;
          site_id?: string;
          status?: string;
          target_id?: string;
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
      shared_content: {
        Row: {
          content_id: string;
          created_at: string | null;
          id: string;
          source_site_id: string;
          target_site_id: string;
        };
        Insert: {
          content_id: string;
          created_at?: string | null;
          id?: string;
          source_site_id: string;
          target_site_id: string;
        };
        Update: {
          content_id?: string;
          created_at?: string | null;
          id?: string;
          source_site_id?: string;
          target_site_id?: string;
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
      site_feature_flags: {
        Row: {
          created_at: string;
          description: string;
          flag_key: string;
          id: string;
          is_enabled: boolean;
          site_id: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          description?: string;
          flag_key: string;
          id?: string;
          is_enabled?: boolean;
          site_id: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          description?: string;
          flag_key?: string;
          id?: string;
          is_enabled?: boolean;
          site_id?: string;
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
      site_integrations: {
        Row: {
          config: Json;
          created_at: string;
          id: string;
          is_enabled: boolean;
          provider_key: string;
          site_id: string;
          updated_at: string;
        };
        Insert: {
          config?: Json;
          created_at?: string;
          id?: string;
          is_enabled?: boolean;
          provider_key: string;
          site_id: string;
          updated_at?: string;
        };
        Update: {
          config?: Json;
          created_at?: string;
          id?: string;
          is_enabled?: boolean;
          provider_key?: string;
          site_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "site_integrations_provider_key_fkey";
            columns: ["provider_key"];
            isOneToOne: false;
            referencedRelation: "integration_providers";
            referencedColumns: ["key"];
          },
          {
            foreignKeyName: "site_integrations_site_id_fkey";
            columns: ["site_id"];
            isOneToOne: false;
            referencedRelation: "sites";
            referencedColumns: ["id"];
          },
        ];
      };
      site_modules: {
        Row: {
          config: Json;
          created_at: string;
          id: string;
          is_enabled: boolean;
          module_key: string;
          site_id: string;
          updated_at: string;
        };
        Insert: {
          config?: Json;
          created_at?: string;
          id?: string;
          is_enabled?: boolean;
          module_key: string;
          site_id: string;
          updated_at?: string;
        };
        Update: {
          config?: Json;
          created_at?: string;
          id?: string;
          is_enabled?: boolean;
          module_key?: string;
          site_id?: string;
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
      sites: {
        Row: {
          ad_config: Json | null;
          created_at: string | null;
          direction: string;
          domain: string | null;
          est_revenue_per_click: number | null;
          favicon_url: string | null;
          features: Json | null;
          footer_nav: Json | null;
          homepage_template: string;
          id: string;
          is_active: boolean | null;
          language: string;
          logo_url: string | null;
          meta_description: string | null;
          meta_title: string | null;
          monetization_modules: Json;
          monetization_type: string | null;
          name: string;
          nav_items: Json | null;
          og_image_url: string | null;
          product_card_style: string;
          slug: string;
          social_links: Json | null;
          theme: Json | null;
          updated_at: string | null;
          url_redirects: Json;
        };
        Insert: {
          ad_config?: Json | null;
          created_at?: string | null;
          direction?: string;
          domain?: string | null;
          est_revenue_per_click?: number | null;
          favicon_url?: string | null;
          features?: Json | null;
          footer_nav?: Json | null;
          homepage_template?: string;
          id?: string;
          is_active?: boolean | null;
          language?: string;
          logo_url?: string | null;
          meta_description?: string | null;
          meta_title?: string | null;
          monetization_modules?: Json;
          monetization_type?: string | null;
          name: string;
          nav_items?: Json | null;
          og_image_url?: string | null;
          product_card_style?: string;
          slug: string;
          social_links?: Json | null;
          theme?: Json | null;
          updated_at?: string | null;
          url_redirects?: Json;
        };
        Update: {
          ad_config?: Json | null;
          created_at?: string | null;
          direction?: string;
          domain?: string | null;
          est_revenue_per_click?: number | null;
          favicon_url?: string | null;
          features?: Json | null;
          footer_nav?: Json | null;
          homepage_template?: string;
          id?: string;
          is_active?: boolean | null;
          language?: string;
          logo_url?: string | null;
          meta_description?: string | null;
          meta_title?: string | null;
          monetization_modules?: Json;
          monetization_type?: string | null;
          name?: string;
          nav_items?: Json | null;
          og_image_url?: string | null;
          product_card_style?: string;
          slug?: string;
          social_links?: Json | null;
          theme?: Json | null;
          updated_at?: string | null;
          url_redirects?: Json;
        };
        Relationships: [];
      };
      stripe_event_failures: {
        Row: {
          attempts: number;
          created_at: string;
          error_message: string | null;
          event_id: string;
          event_type: string;
          id: string;
          payload: Json;
          resolved_at: string | null;
          resolved_by: string | null;
        };
        Insert: {
          attempts?: number;
          created_at?: string;
          error_message?: string | null;
          event_id: string;
          event_type: string;
          id?: string;
          payload?: Json;
          resolved_at?: string | null;
          resolved_by?: string | null;
        };
        Update: {
          attempts?: number;
          created_at?: string;
          error_message?: string | null;
          event_id?: string;
          event_type?: string;
          id?: string;
          payload?: Json;
          resolved_at?: string | null;
          resolved_by?: string | null;
        };
        Relationships: [];
      };
      stripe_events: {
        Row: {
          created_at: string;
          event_type: string;
          received_at: string;
          stripe_event_id: string;
        };
        Insert: {
          created_at?: string;
          event_type: string;
          received_at?: string;
          stripe_event_id: string;
        };
        Update: {
          created_at?: string;
          event_type?: string;
          received_at?: string;
          stripe_event_id?: string;
        };
        Relationships: [];
      };
      subject_objections: {
        Row: {
          id: string;
          site_id: string;
          email: string;
          scope: string;
          reason: string | null;
          objected_at: string;
          withdrawn_at: string | null;
          created_by: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          site_id: string;
          email: string;
          scope?: string;
          reason?: string | null;
          objected_at?: string;
          withdrawn_at?: string | null;
          created_by: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          site_id?: string;
          email?: string;
          scope?: string;
          reason?: string | null;
          objected_at?: string;
          withdrawn_at?: string | null;
          created_by?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "subject_objections_site_id_fkey";
            columns: ["site_id"];
            isOneToOne: false;
            referencedRelation: "sites";
            referencedColumns: ["id"];
          },
        ];
      };
      subject_restrictions: {
        Row: {
          created_by: string;
          email: string;
          id: string;
          lifted_at: string | null;
          reason: string | null;
          restricted_at: string;
          site_id: string;
        };
        Insert: {
          created_by: string;
          email: string;
          id?: string;
          lifted_at?: string | null;
          reason?: string | null;
          restricted_at?: string;
          site_id: string;
        };
        Update: {
          created_by?: string;
          email?: string;
          id?: string;
          lifted_at?: string | null;
          reason?: string | null;
          restricted_at?: string;
          site_id?: string;
        };
        Relationships: [];
      };
      user_site_roles: {
        Row: {
          created_at: string;
          id: string;
          role_id: string;
          site_id: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          role_id: string;
          site_id: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          role_id?: string;
          site_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "user_site_roles_role_id_fkey";
            columns: ["role_id"];
            isOneToOne: false;
            referencedRelation: "roles";
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
            foreignKeyName: "user_site_roles_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "admin_users";
            referencedColumns: ["id"];
          },
        ];
      };
      web_vitals: {
        Row: {
          created_at: string;
          href: string | null;
          id: string;
          metric_id: string | null;
          name: string;
          page: string | null;
          rating: string | null;
          value: number;
        };
        Insert: {
          created_at?: string;
          href?: string | null;
          id?: string;
          metric_id?: string | null;
          name: string;
          page?: string | null;
          rating?: string | null;
          value: number;
        };
        Update: {
          created_at?: string;
          href?: string | null;
          id?: string;
          metric_id?: string | null;
          name?: string;
          page?: string | null;
          rating?: string | null;
          value?: number;
        };
        Relationships: [];
      };
      webhook_dlq: {
        Row: {
          attempts: number;
          created_at: string;
          error_message: string | null;
          event_id: string;
          event_type: string;
          id: string;
          payload: Json;
          resolved_at: string | null;
          status: string;
        };
        Insert: {
          attempts?: number;
          created_at?: string;
          error_message?: string | null;
          event_id: string;
          event_type: string;
          id?: string;
          payload: Json;
          resolved_at?: string | null;
          status?: string;
        };
        Update: {
          attempts?: number;
          created_at?: string;
          error_message?: string | null;
          event_id?: string;
          event_type?: string;
          id?: string;
          payload?: Json;
          resolved_at?: string | null;
          status?: string;
        };
        Relationships: [];
      };
      wrist_shots: {
        Row: {
          approved_at: string | null;
          caption: string | null;
          created_at: string;
          id: string;
          image_url: string;
          product_id: string | null;
          site_id: string;
          status: string;
          updated_at: string;
          user_email: string;
          user_name: string;
        };
        Insert: {
          approved_at?: string | null;
          caption?: string | null;
          created_at?: string;
          id?: string;
          image_url: string;
          product_id?: string | null;
          site_id: string;
          status?: string;
          updated_at?: string;
          user_email: string;
          user_name: string;
        };
        Update: {
          approved_at?: string | null;
          caption?: string | null;
          created_at?: string;
          id?: string;
          image_url?: string;
          product_id?: string | null;
          site_id?: string;
          status?: string;
          updated_at?: string;
          user_email?: string;
          user_name?: string;
        };
        Relationships: [
          {
            foreignKeyName: "wrist_shots_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "wrist_shots_site_id_fkey";
            columns: ["site_id"];
            isOneToOne: false;
            referencedRelation: "sites";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      apply_stripe_membership_event: {
        Args: {
          p_event_data: Json;
          p_event_type: string;
          p_stripe_event_id: string;
        };
        Returns: Json;
      };
      current_request_site_id: { Args: never; Returns: string };
      current_request_site_ids: { Args: never; Returns: string[] };
      db_now: { Args: never; Returns: string };
      erase_subject_data: {
        Args: { p_actor: string; p_email: string; p_site_id: string };
        Returns: Json;
      };
      erase_user: { Args: { p_email: string }; Returns: Json };
      generate_price_display: {
        Args: { p_amount: number; p_currency: string };
        Returns: string;
      };
      get_daily_clicks: {
        Args: { p_since: string; p_site_id: string };
        Returns: {
          count: number;
          date: string;
        }[];
      };
      get_dashboard_stats: {
        Args: {
          p_seven_days_ago: string;
          p_site_id: string;
          p_today_start: string;
        };
        Returns: Json;
      };
      get_niche_health_stats: {
        Args: { p_fourteen_days_ago: string; p_seven_days_ago: string };
        Returns: {
          clicks_7d: number;
          clicks_prev_7d: number;
          last_published_at: string;
          site_id: string;
          subscriber_count: number;
          total_content: number;
          total_products: number;
        }[];
      };
      get_top_content_slugs: {
        Args: { p_limit: number; p_since: string; p_site_id: string };
        Returns: {
          click_count: number;
          content_slug: string;
        }[];
      };
      get_top_products: {
        Args: { p_limit: number; p_since: string; p_site_id: string };
        Returns: {
          click_count: number;
          product_name: string;
        }[];
      };
      get_top_referrers: {
        Args: { p_limit: number; p_since: string; p_site_id: string };
        Returns: {
          click_count: number;
          referrer: string;
        }[];
      };
      increment_login_failed_attempts: {
        Args: {
          lockout_duration_ms?: number;
          lockout_threshold?: number;
          user_id: string;
        };
        Returns: Json;
      };
      purge_retention: { Args: never; Returns: Json };
      record_ad_impression:
        | {
            Args: {
              p_ad_placement_id: string;
              p_content_id: string;
              p_cpm_revenue_cents: number;
              p_page_path: string;
              p_site_id: string;
            };
            Returns: undefined;
          }
        | {
            Args: {
              p_ad_placement_id: string;
              p_content_id: string;
              p_cpm_revenue_cents: number;
              p_page_path: string;
              p_site_id: string;
            };
            Returns: undefined;
          };
      reorder_pages:
        | { Args: { p_site_id: string; updates: Json }; Returns: undefined }
        | { Args: { updates: Json }; Returns: undefined };
      set_linked_products: {
        Args: { p_content_id: string; p_links: Json; p_site_id: string };
        Returns: undefined;
      };
      show_limit: { Args: never; Returns: number };
      show_trgm: { Args: { "": string }; Returns: string[] };
      top_content_by_clicks: {
        Args: { p_limit?: number; p_site_id: string };
        Returns: {
          click_count: number;
          content_slug: string;
        }[];
      };
      top_products_by_clicks: {
        Args: { p_limit?: number; p_site_id: string };
        Returns: {
          click_count: number;
          product_name: string;
        }[];
      };
      top_referrers: {
        Args: { p_limit?: number; p_site_id: string };
        Returns: {
          referral_count: number;
          referrer: string;
        }[];
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {},
  },
} as const;

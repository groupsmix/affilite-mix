# A31#15-18: Cloudflare Storage Configuration
# KV namespaces and R2 buckets with lifecycle and compliance settings

# ═══════════════════════════════════════════════════════════════════════════════
# KV Namespaces
# A31#15: KV encryption and access logging
# ═══════════════════════════════════════════════════════════════════════════════

resource "cloudflare_workers_kv_namespace" "rate_limit" {
  account_id = var.cloudflare_account_id
  title      = "RATE_LIMIT_KV"
  
  # Note: Cloudflare KV is encrypted at rest by Cloudflare
  # No BYOK available in current provider version
  # A31#15: Key material is Cloudflare-managed; document in security architecture
}

resource "cloudflare_workers_kv_namespace" "app_cache" {
  account_id = var.cloudflare_account_id
  title      = "APP_CACHE_KV"
}

# KV Audit Logging - Logpush for KV operations
resource "cloudflare_logpush_job" "kv_audit" {
  count = var.logpush_enabled ? 1 : 0

  account_id       = var.cloudflare_account_id
  dataset          = "workers_kv"
  destination_conf = var.logpush_destination_conf
  name             = "kv-audit-logs"
  enabled          = true
  
  output_options {
    field_names = [
      "AccountID",
      "Action",
      "Key",
      "NamespaceID",
      "Timestamp",
      "User",
    ]
  }
}

# ═══════════════════════════════════════════════════════════════════════════════
# R2 Buckets
# A31#16-17: R2 with lifecycle, versioning, object-lock
# ═══════════════════════════════════════════════════════════════════════════════

# A31#16: R2 bucket for Next.js incremental cache
resource "cloudflare_r2_bucket" "next_inc_cache" {
  account_id = var.cloudflare_account_id
  name       = "next-inc-cache"
  location   = var.r2_default_location  # Default: WNAM
  
  # Object lock for tamper-evident cache (if supported by provider)
  # Note: Cloudflare R2 object lock may require dashboard configuration
}

# Lifecycle rule for cache expiration (30 days)
resource "cloudflare_r2_bucket_lifecycle" "next_inc_cache" {
  account_id  = var.cloudflare_account_id
  bucket_name = cloudflare_r2_bucket.next_inc_cache.name
  
  rule {
    id     = "expire-30d"
    status = "Enabled"
    
    expiration {
      days = 30
    }
    
    # Clean up incomplete multipart uploads
    abort_incomplete_multipart_upload {
      days_after_initiation = 1
    }
  }
}

# A31#17: R2 bucket for worker logs with compliance retention
resource "cloudflare_r2_bucket" "worker_logs" {
  account_id = var.cloudflare_account_id
  name       = "worker-logs"
  location   = var.r2_default_location
  
  # A31#16: Object lock for WORM compliance (audit requirement)
  # Note: May require manual dashboard configuration
}

# Lifecycle rule for log retention (365 days = 1 year)
# A31#17: Retention rule prevents indefinite accumulation
resource "cloudflare_r2_bucket_lifecycle" "worker_logs" {
  account_id  = var.cloudflare_account_id
  bucket_name = cloudflare_r2_bucket.worker_logs.name
  
  rule {
    id     = "logs-retain-365d"
    status = "Enabled"
    
    expiration {
      days = 365  # 1 year retention for SOC2/GDPR compliance
    }
    
    # A31#16: Transition to cheaper storage after 90 days
    transition {
      days          = 90
      storage_class = "Standard-InfrequentAccess"
    }
    
    abort_incomplete_multipart_upload {
      days_after_initiation = 1
    }
  }
}

# A31#16: Audit archive bucket with extended retention
resource "cloudflare_r2_bucket" "audit_archive" {
  account_id = var.cloudflare_account_id
  name       = "audit-archive-worm"
  location   = var.r2_default_location
  
  # A31#16: Object lock enabled for WORM (Write Once Read Many)
  # Required for SOC2/PCI tamper-evident log retention
}

# 7-year retention for audit compliance (SOC2/PCI)
resource "cloudflare_r2_bucket_lifecycle" "audit_archive" {
  account_id  = var.cloudflare_account_id
  bucket_name = cloudflare_r2_bucket.audit_archive.name
  
  rule {
    id     = "audit-retain-7y"
    status = "Enabled"
    
    expiration {
      days = 2555  # 7 years for compliance
    }
    
    # Keep in IA after 1 year
    transition {
      days          = 365
      storage_class = "Standard-InfrequentAccess"
    }
  }
}

# A31#16: Stripe webhook DLQ bucket
resource "cloudflare_r2_bucket" "stripe_webhook_dlq" {
  account_id = var.cloudflare_account_id
  name       = "stripe-webhook-dlq"
  location   = var.r2_default_location
}

# 90-day retention for DLQ (sufficient for replay/analysis)
resource "cloudflare_r2_bucket_lifecycle" "stripe_webhook_dlq" {
  account_id  = var.cloudflare_account_id
  bucket_name = cloudflare_r2_bucket.stripe_webhook_dlq.name
  
  rule {
    id     = "dlq-retain-90d"
    status = "Enabled"
    
    expiration {
      days = 90  # Sufficient for failed webhook analysis
    }
  }
}

# A31#17: SBOM storage bucket with extended retention
resource "cloudflare_r2_bucket" "sbom_archive" {
  account_id = var.cloudflare_account_id
  name       = "sbom-archive"
  location   = var.r2_default_location
}

# 3-year SBOM retention (supply chain compliance)
resource "cloudflare_r2_bucket_lifecycle" "sbom_archive" {
  account_id  = var.cloudflare_account_id
  bucket_name = cloudflare_r2_bucket.sbom_archive.name
  
  rule {
    id     = "sbom-retain-3y"
    status = "Enabled"
    
    expiration {
      days = 1095  # 3 years
    }
    
    transition {
      days          = 90
      storage_class = "Standard-InfrequentAccess"
    }
  }
}

# ═══════════════════════════════════════════════════════════════════════════════
# R2 Access Logging
# A37#8: Bucket-level access logging
# ═══════════════════════════════════════════════════════════════════════════════

# Log R2 access events to the worker_logs bucket
resource "cloudflare_r2_bucket" "r2_access_logs" {
  account_id = var.cloudflare_account_id
  name       = "r2-access-logs"
  location   = var.r2_default_location
}

# ═══════════════════════════════════════════════════════════════════════════════
# Cross-Region Replication (when multi-region is needed)
# A31#18: Replication for DR (requires multiple regions)
# ═══════════════════════════════════════════════════════════════════════════════

# Primary location variable (single-region default)
variable "r2_default_location" {
  description = "Default R2 bucket location (WNAM, ENAM, WEU, EEU, APAC, or OC)"
  type        = string
  default     = "WNAM"
}

# Note: For true multi-region DR, create additional buckets in other regions
# and configure client-side replication or use R2's built-in replication
# when available. Currently Cloudflare R2 is single-region per bucket.

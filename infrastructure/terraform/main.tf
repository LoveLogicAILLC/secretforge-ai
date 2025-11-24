terraform {
  required_version = ">= 1.6.0"
  
  required_providers {
    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = "~> 4.0"
    }
  }
  
  backend "s3" {
    bucket = "secretforge-terraform-state"
    key    = "production/terraform.tfstate"
    region = "us-east-1"
    # Enable state locking
    dynamodb_table = "secretforge-terraform-locks"
    encrypt        = true
  }
}

provider "cloudflare" {
  api_token = var.cloudflare_api_token
}

# D1 Database
resource "cloudflare_d1_database" "main" {
  account_id = var.cloudflare_account_id
  name       = "secretforge-db-${var.environment}"
}

# KV Namespace for Secrets Vault
resource "cloudflare_workers_kv_namespace" "secrets_vault" {
  account_id = var.cloudflare_account_id
  title      = "SECRETS_VAULT_${upper(var.environment)}"
}

# KV Namespace for Rate Limiting
resource "cloudflare_workers_kv_namespace" "rate_limits" {
  account_id = var.cloudflare_account_id
  title      = "RATE_LIMITS_${upper(var.environment)}"
}

# Vectorize Index for API Documentation
resource "cloudflare_vectorize_index" "api_docs" {
  account_id = var.cloudflare_account_id
  name       = "api-docs-index-${var.environment}"
  dimensions = 1536
  metric     = "cosine"
}

# Workers Script
resource "cloudflare_worker_script" "api" {
  account_id = var.cloudflare_account_id
  name       = "secretforge-api-${var.environment}"
  content    = file("../../packages/api/dist/index.js")
  
  compatibility_date = "2024-01-01"
  
  kv_namespace_binding {
    name         = "SECRETS_VAULT"
    namespace_id = cloudflare_workers_kv_namespace.secrets_vault.id
  }
  
  kv_namespace_binding {
    name         = "RATE_LIMITS"
    namespace_id = cloudflare_workers_kv_namespace.rate_limits.id
  }
  
  d1_database_binding {
    name        = "DATABASE"
    database_id = cloudflare_d1_database.main.id
  }
  
  vectorize_binding {
    name     = "VECTORIZE_INDEX"
    index_id = cloudflare_vectorize_index.api_docs.id
  }
  
  plain_text_binding {
    name = "ENVIRONMENT"
    text = var.environment
  }
  
  plain_text_binding {
    name = "GIT_SHA"
    text = var.git_sha
  }
  
  secret_text_binding {
    name = "OPENAI_API_KEY"
    text = var.openai_api_key
  }
  
  secret_text_binding {
    name = "ANTHROPIC_API_KEY"
    text = var.anthropic_api_key
  }
  
  secret_text_binding {
    name = "ENCRYPTION_KEY"
    text = var.encryption_key
  }
}

# Worker Route
resource "cloudflare_worker_route" "api" {
  count = var.custom_domain != "" ? 1 : 0
  
  zone_id     = var.cloudflare_zone_id
  pattern     = "${var.custom_domain}/api/*"
  script_name = cloudflare_worker_script.api.name
}

# Worker Domain (if custom domain provided)
resource "cloudflare_worker_domain" "api" {
  count = var.custom_domain != "" ? 1 : 0
  
  account_id = var.cloudflare_account_id
  hostname   = var.custom_domain
  service    = cloudflare_worker_script.api.name
  zone_id    = var.cloudflare_zone_id
}

# Analytics Engine Binding (for metrics)
resource "cloudflare_workers_analytics_engine_binding" "metrics" {
  account_id = var.cloudflare_account_id
  name       = "ANALYTICS"
}

# Logpush Job (send logs to S3/Datadog/etc)
resource "cloudflare_logpush_job" "worker_logs" {
  count = var.enable_logpush ? 1 : 0
  
  account_id  = var.cloudflare_account_id
  dataset     = "workers_trace_events"
  destination_conf = var.logpush_destination
  enabled     = true
  name        = "secretforge-api-${var.environment}-logs"
  
  filter = jsonencode({
    where = {
      and = [
        { key = "ScriptName", operator = "eq", value = cloudflare_worker_script.api.name }
      ]
    }
  })
}

# WAF Rules for API Protection
resource "cloudflare_ruleset" "waf" {
  count = var.enable_waf ? 1 : 0
  
  zone_id     = var.cloudflare_zone_id
  name        = "SecretForge API WAF - ${var.environment}"
  description = "WAF rules for SecretForge API"
  kind        = "zone"
  phase       = "http_request_firewall_managed"
  
  rules {
    action = "block"
    expression = "(http.request.uri.path contains \"/api/\" and cf.threat_score > 30)"
    description = "Block high threat score requests"
    enabled = true
  }
  
  rules {
    action = "challenge"
    expression = "(http.request.uri.path contains \"/api/secrets\" and cf.bot_management.score < 30)"
    description = "Challenge potential bot requests to sensitive endpoints"
    enabled = true
  }
}

# Rate Limiting Rules
resource "cloudflare_ruleset" "rate_limiting" {
  count = var.enable_rate_limiting ? 1 : 0
  
  zone_id     = var.cloudflare_zone_id
  name        = "SecretForge API Rate Limiting - ${var.environment}"
  description = "Rate limiting for SecretForge API"
  kind        = "zone"
  phase       = "http_ratelimit"
  
  rules {
    action = "block"
    ratelimit {
      characteristics = ["cf.colo.id", "ip.src"]
      period          = 60
      requests_per_period = var.environment == "production" ? 100 : 1000
      mitigation_timeout  = 600
    }
    expression = "(http.request.uri.path contains \"/api/\")"
    description = "Limit API requests to ${var.environment == "production" ? 100 : 1000} per minute per IP"
    enabled = true
  }
}

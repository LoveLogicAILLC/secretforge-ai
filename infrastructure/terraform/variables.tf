variable "cloudflare_account_id" {
  description = "Cloudflare Account ID"
  type        = string
}

variable "cloudflare_api_token" {
  description = "Cloudflare API Token with Workers, D1, KV, and Vectorize permissions"
  type        = string
  sensitive   = true
}

variable "cloudflare_zone_id" {
  description = "Cloudflare Zone ID for custom domain (optional)"
  type        = string
  default     = ""
}

variable "openai_api_key" {
  description = "OpenAI API Key"
  type        = string
  sensitive   = true
}

variable "anthropic_api_key" {
  description = "Anthropic API Key"
  type        = string
  sensitive   = true
}

variable "encryption_key" {
  description = "32-byte base64 encoded encryption key"
  type        = string
  sensitive   = true
  
  validation {
    condition     = length(var.encryption_key) >= 32
    error_message = "Encryption key must be at least 32 characters"
  }
}

variable "environment" {
  description = "Deployment environment"
  type        = string
  default     = "production"
  
  validation {
    condition     = contains(["staging", "production", "canary"], var.environment)
    error_message = "Environment must be staging, production, or canary"
  }
}

variable "git_sha" {
  description = "Git commit SHA for deployment tracking"
  type        = string
  default     = "unknown"
}

variable "custom_domain" {
  description = "Custom domain for the API (e.g., api.secretforge.ai)"
  type        = string
  default     = ""
}

variable "enable_logpush" {
  description = "Enable Cloudflare Logpush for centralized logging"
  type        = bool
  default     = true
}

variable "logpush_destination" {
  description = "Logpush destination (e.g., s3://bucket/path or https://logs.datadoghq.com)"
  type        = string
  default     = ""
}

variable "enable_waf" {
  description = "Enable WAF rules for API protection"
  type        = bool
  default     = true
}

variable "enable_rate_limiting" {
  description = "Enable rate limiting for API endpoints"
  type        = bool
  default     = true
}

variable "tags" {
  description = "Tags to apply to all resources"
  type        = map(string)
  default = {
    Project     = "SecretForge"
    ManagedBy   = "Terraform"
  }
}

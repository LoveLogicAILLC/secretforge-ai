output "worker_url" {
  description = "Cloudflare Workers URL"
  value       = "https://${cloudflare_worker_script.api.name}.${var.cloudflare_account_id}.workers.dev"
}

output "custom_domain_url" {
  description = "Custom domain URL (if configured)"
  value       = var.custom_domain != "" ? "https://${var.custom_domain}" : null
}

output "d1_database_id" {
  description = "D1 Database ID"
  value       = cloudflare_d1_database.main.id
}

output "kv_secrets_vault_id" {
  description = "KV Namespace ID for Secrets Vault"
  value       = cloudflare_workers_kv_namespace.secrets_vault.id
}

output "kv_rate_limits_id" {
  description = "KV Namespace ID for Rate Limits"
  value       = cloudflare_workers_kv_namespace.rate_limits.id
}

output "vectorize_index_id" {
  description = "Vectorize Index ID"
  value       = cloudflare_vectorize_index.api_docs.id
}

output "environment" {
  description = "Deployment environment"
  value       = var.environment
}

output "git_sha" {
  description = "Deployed Git SHA"
  value       = var.git_sha
}

output "health_check_url" {
  description = "Health check endpoint URL"
  value       = var.custom_domain != "" ? "https://${var.custom_domain}/health" : "https://${cloudflare_worker_script.api.name}.${var.cloudflare_account_id}.workers.dev/health"
}

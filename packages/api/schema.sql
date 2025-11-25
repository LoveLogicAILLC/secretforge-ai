-- SecretForge AI Database Schema
-- D1 (SQLite) schema for metadata and audit logs

-- Users table
CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    tier TEXT NOT NULL CHECK(tier IN ('free', 'pro', 'team', 'enterprise')) DEFAULT 'free',
    organization_id TEXT,
    stripe_customer_id TEXT,
    stripe_subscription_id TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    last_login_at TEXT,
    is_active BOOLEAN DEFAULT 1
);

CREATE INDEX IF NOT EXISTS idx_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_organization ON users(organization_id);
CREATE INDEX IF NOT EXISTS idx_tier ON users(tier);

-- Organizations table
CREATE TABLE IF NOT EXISTS organizations (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    tier TEXT NOT NULL CHECK(tier IN ('team', 'enterprise')) DEFAULT 'team',
    stripe_customer_id TEXT,
    stripe_subscription_id TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    is_active BOOLEAN DEFAULT 1
);

-- Organization members
CREATE TABLE IF NOT EXISTS organization_members (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    organization_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('owner', 'admin', 'member', 'viewer')) DEFAULT 'member',
    invited_at TEXT NOT NULL DEFAULT (datetime('now')),
    joined_at TEXT,
    FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE(organization_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_org_member ON organization_members(organization_id, user_id);

-- API Keys table
CREATE TABLE IF NOT EXISTS api_keys (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    key_hash TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    scopes TEXT, -- JSON array
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    expires_at TEXT,
    last_used_at TEXT,
    revoked BOOLEAN DEFAULT 0,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_key_hash ON api_keys(key_hash);
CREATE INDEX IF NOT EXISTS idx_user_apikey ON api_keys(user_id);

-- Secrets metadata table
CREATE TABLE IF NOT EXISTS secrets (
    id TEXT PRIMARY KEY,
    service TEXT NOT NULL,
    environment TEXT NOT NULL CHECK(environment IN ('dev', 'staging', 'prod')),
    user_id TEXT NOT NULL,
    scopes TEXT, -- JSON array
    created_at TEXT NOT NULL,
    last_rotated_at TEXT,
    rotation_policy_days INTEGER DEFAULT 90,
    is_active BOOLEAN DEFAULT 1
);

CREATE INDEX IF NOT EXISTS idx_user_service ON secrets(user_id, service);
CREATE INDEX IF NOT EXISTS idx_environment ON secrets(environment);
CREATE INDEX IF NOT EXISTS idx_created_at ON secrets(created_at);

-- Audit log for all secret operations
CREATE TABLE IF NOT EXISTS audit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    secret_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    action TEXT NOT NULL CHECK(action IN ('created', 'retrieved', 'rotated', 'deleted', 'validated')),
    ip_address TEXT,
    user_agent TEXT,
    metadata TEXT, -- JSON
    timestamp TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (secret_id) REFERENCES secrets(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_secret_id ON audit_logs(secret_id);
CREATE INDEX IF NOT EXISTS idx_user_id ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_timestamp ON audit_logs(timestamp);

-- Service configurations
CREATE TABLE IF NOT EXISTS service_configs (
    service TEXT PRIMARY KEY,
    provider_name TEXT NOT NULL,
    api_base_url TEXT,
    auth_type TEXT CHECK(auth_type IN ('bearer', 'api_key', 'oauth2')),
    default_scopes TEXT, -- JSON array
    documentation_url TEXT,
    rotation_supported BOOLEAN DEFAULT 1,
    metadata TEXT -- JSON
);

-- User preferences
CREATE TABLE IF NOT EXISTS user_preferences (
    user_id TEXT PRIMARY KEY,
    default_environment TEXT DEFAULT 'dev',
    auto_rotation_enabled BOOLEAN DEFAULT 1,
    notification_email TEXT,
    compliance_frameworks TEXT, -- JSON array: ['SOC2', 'GDPR', ...]
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Key rotation schedules
CREATE TABLE IF NOT EXISTS rotation_schedules (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    secret_id TEXT NOT NULL,
    scheduled_for TEXT NOT NULL,
    completed_at TEXT,
    status TEXT CHECK(status IN ('pending', 'completed', 'failed')) DEFAULT 'pending',
    error_message TEXT,
    FOREIGN KEY (secret_id) REFERENCES secrets(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_status_scheduled ON rotation_schedules(status, scheduled_for);

-- Compliance validation history
CREATE TABLE IF NOT EXISTS compliance_validations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    secret_id TEXT NOT NULL,
    framework TEXT NOT NULL,
    is_compliant BOOLEAN NOT NULL,
    validation_results TEXT NOT NULL, -- JSON
    validated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (secret_id) REFERENCES secrets(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_secret_framework ON compliance_validations(secret_id, framework);

-- Insert default service configurations
INSERT OR IGNORE INTO service_configs (service, provider_name, api_base_url, auth_type, default_scopes, documentation_url) VALUES
    ('stripe', 'Stripe', 'https://api.stripe.com', 'bearer', '["read_write"]', 'https://stripe.com/docs/api'),
    ('openai', 'OpenAI', 'https://api.openai.com/v1', 'bearer', '["api.read", "api.write"]', 'https://platform.openai.com/docs'),
    ('anthropic', 'Anthropic', 'https://api.anthropic.com', 'api_key', '["messages.read", "messages.write"]', 'https://docs.anthropic.com'),
    ('aws', 'Amazon Web Services', 'https://aws.amazon.com', 'api_key', '["s3:read", "s3:write"]', 'https://docs.aws.amazon.com'),
    ('supabase', 'Supabase', 'https://supabase.com', 'bearer', '["full_access"]', 'https://supabase.com/docs'),
    ('sendgrid', 'SendGrid', 'https://api.sendgrid.com', 'bearer', '["mail.send"]', 'https://docs.sendgrid.com'),
    ('twilio', 'Twilio', 'https://api.twilio.com', 'api_key', '["messaging"]', 'https://www.twilio.com/docs');

-- Usage tracking for billing
CREATE TABLE IF NOT EXISTS usage_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    event_type TEXT NOT NULL CHECK(event_type IN ('secret_created', 'secret_rotated', 'api_call', 'ai_request')),
    metadata TEXT, -- JSON
    timestamp TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_usage_user_date ON usage_events(user_id, timestamp);
CREATE INDEX IF NOT EXISTS idx_usage_type ON usage_events(event_type);

-- Webhooks configuration
CREATE TABLE IF NOT EXISTS webhooks (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    url TEXT NOT NULL,
    events TEXT NOT NULL, -- JSON array
    secret TEXT, -- For signature verification
    is_active BOOLEAN DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    last_triggered_at TEXT,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_webhook_user ON webhooks(user_id);

-- Webhook delivery attempts
CREATE TABLE IF NOT EXISTS webhook_deliveries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    webhook_id TEXT NOT NULL,
    event_type TEXT NOT NULL,
    payload TEXT NOT NULL, -- JSON
    response_status INTEGER,
    response_body TEXT,
    delivered_at TEXT NOT NULL DEFAULT (datetime('now')),
    success BOOLEAN NOT NULL,
    FOREIGN KEY (webhook_id) REFERENCES webhooks(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_delivery_webhook ON webhook_deliveries(webhook_id);

-- Create triggers for updated_at
CREATE TRIGGER IF NOT EXISTS update_user_timestamp
AFTER UPDATE ON users
FOR EACH ROW
BEGIN
    UPDATE users SET updated_at = datetime('now') WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS update_organization_timestamp
AFTER UPDATE ON organizations
FOR EACH ROW
BEGIN
    UPDATE organizations SET updated_at = datetime('now') WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS update_user_preferences_timestamp
AFTER UPDATE ON user_preferences
FOR EACH ROW
BEGIN
    UPDATE user_preferences SET updated_at = datetime('now') WHERE user_id = NEW.user_id;
END;

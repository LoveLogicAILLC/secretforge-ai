-- SecretForge AI Database Schema
-- D1 (SQLite) schema for metadata and audit logs

-- Secrets metadata table (Phase 1)
CREATE TABLE IF NOT EXISTS secrets (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    project TEXT NOT NULL,
    environment TEXT NOT NULL CHECK(environment IN ('dev', 'staging', 'prod')),
    tags TEXT NOT NULL DEFAULT '[]', -- JSON array
    value_encrypted TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE(name, project, environment)
);

CREATE INDEX IF NOT EXISTS idx_project_env ON secrets(project, environment);
CREATE INDEX IF NOT EXISTS idx_name ON secrets(name);
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

-- Create triggers for updated_at
CREATE TRIGGER IF NOT EXISTS update_user_preferences_timestamp
AFTER UPDATE ON user_preferences
FOR EACH ROW
BEGIN
    UPDATE user_preferences SET updated_at = datetime('now') WHERE user_id = NEW.user_id;
END;

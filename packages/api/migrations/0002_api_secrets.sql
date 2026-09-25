-- 0002: tables for the hosted API's secret vault.
--
-- The API previously read/wrote `secrets.user_id`, `service`, `scopes`,
-- `is_active` and `last_rotated_at`, none of which exist on the CLI-shaped
-- `secrets` table (which also CHECKs environment IN dev/staging/prod while the
-- API uses development/production). Every create/list/delete/validate call
-- failed. The API now uses its own tables. Audit and compliance rows for API
-- secrets get their own tables too, because the existing ones carry a foreign
-- key to secrets(id) that API secret ids can never satisfy.

CREATE TABLE IF NOT EXISTS api_secrets (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    service TEXT NOT NULL,
    environment TEXT NOT NULL CHECK(environment IN ('development', 'staging', 'production')),
    scopes TEXT NOT NULL DEFAULT '[]',
    origin TEXT NOT NULL CHECK(origin IN ('generated', 'imported')) DEFAULT 'imported',
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    last_rotated_at TEXT,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_api_secrets_user ON api_secrets(user_id, is_active);

CREATE TABLE IF NOT EXISTS api_audit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    secret_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    action TEXT NOT NULL CHECK(action IN ('created', 'retrieved', 'rotated', 'deleted', 'validated')),
    ip_address TEXT,
    user_agent TEXT,
    timestamp TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_api_audit_secret ON api_audit_logs(secret_id, timestamp);
CREATE INDEX IF NOT EXISTS idx_api_audit_user ON api_audit_logs(user_id, timestamp);

CREATE TABLE IF NOT EXISTS api_compliance_validations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    secret_id TEXT NOT NULL,
    framework TEXT NOT NULL,
    is_compliant INTEGER NOT NULL,
    validation_results TEXT NOT NULL,
    validated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (secret_id) REFERENCES api_secrets(id) ON DELETE CASCADE
);

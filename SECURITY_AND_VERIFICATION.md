# SecretForge AI — Security Hardening & Production Verification

This document records the architecture, production deployment configuration, database migrations, and verification evidence for SecretForge AI following the security hardening release.

---

## 1. Security Architecture & Hardening Invariants

### 1.1 Authentication & Privilege Escalation Controls
- **Strict Tier Enforcement at Signup (`/auth/signup`)**:
  - Request payloads containing `tier: "enterprise"` (or any other tier) have the parameter stripped and strictly default to `free`.
  - Paid tiers (`pro`, `team`, `enterprise`) can only ever be provisioned server-side via verified Stripe webhook signatures or administrative endpoints.
- **Password Hashing**:
  - Standardized on **PBKDF2-HMAC-SHA256** with 100,000 iterations and cryptographically random 16-byte salts.
  - Legacy password hashes are automatically verified and upgraded upon successful user authentication.

### 1.2 Cryptographic Envelope Security
- **AES-256-GCM with Additional Authenticated Data (AAD)**:
  - Both CLI local vaults and Cloudflare Worker API secret envelopes bind record and tenant IDs as AAD during encryption and decryption.
  - Mitigates row-swap and ciphertext substitution attacks across tenants and records.
- **Worker Secret Separation**:
  - `JWT_SECRET`, `ENCRYPTION_KEY`, and `API_KEY_SALT` are stored strictly in Cloudflare Worker Secrets (`wrangler secret put`).
  - No secret values or placeholders exist in `wrangler.jsonc` `vars`, preventing shadowing of production secrets.

### 1.3 Detection Engine v2 & Dogfooding
- **Engine Rules**: 25 entropy-calibrated rules covering AWS STS, Stripe, GitHub fine-grained PATs, OpenAI project keys (`sk-proj-`), Anthropic, and Google cloud keys.
- **CLI Commands**: `sf scan` (working directory, staged git index, and commit history) and `sf hook` (pre-commit hook installer).
- **Baseline Support**: Attributed test fixture mock secrets in `.secretforge-baseline.json`.

---

## 2. Production Deployment Configuration

- **Worker Name**: `secretforge-api`
- **Live Endpoint**: `https://secretforge-api.jmjones925.workers.dev`
- **Cloudflare Account ID**: `44d2776071b00210e44fb2f5efe2352e`

### Resource Bindings
| Binding | Type | ID / Resource Name |
| :--- | :--- | :--- |
| `DATABASE` | Cloudflare D1 | `83cce8ad-9f2e-404f-9ada-943849e14efe` (`secretforge-db`) |
| `SECRETS_VAULT` | Workers KV | `b71460ab4b6447b2924b56080365d3c4` |
| `RATE_LIMIT_KV` | Workers KV | `f044969427384382b43af253ec64e41c` |
| `VECTOR_DB` | Vectorize | `api-docs-index` (1536 dim, cosine) |
| `SECRET_AGENT` | Durable Object | `SecretAgent` |

---

## 3. Database Schema & Migrations

### Applied Migrations
1. **Auth & Identity Schema**:
   - `users`: Includes `email`, `password_hash`, `tier CHECK ('free', 'pro', 'team', 'enterprise')`, timestamps.
   - `organizations` & `organization_members`: Team and organization RBAC.
   - `api_keys`: Hashed API key authentication with prefixes and scopes.
2. **`0002_api_secrets.sql`**:
   - `api_secrets`: Stores encrypted metadata and envelope keys.
   - `api_audit_logs`: Immutable audit trails for secret access and rotations.
   - `api_compliance_validations`: SOC2, HIPAA, GDPR compliance checks.

---

## 4. Verification Evidence

### 4.1 Automated Test Suites (157 / 157 PASS — 100%)
- **`@secretforge/shared`**: 48 passed across 2 test files (detection rules, entropy, diff scanner).
- **`@secretforge/cli`**: 63 passed across 6 test files (storage, crypto, security, audit, scan).
- **`@secretforge/api`**: 46 passed across 4 test files (auth, encryption, rate limits, integration).

### 4.2 Live Production API Suite
The live endpoint was exercised and confirmed with automated test runs:
- **`GET /health`**: Returns `HTTP 200 OK` (`{"status":"healthy","version":"1.0.0"}`).
- **`POST /auth/signup`**: Tested with payload `{"email":"...","password":"...","tier":"enterprise"}`:
  - Returns `HTTP 201 Created`.
  - Assigned user tier is strictly `free`.
  - Valid signed JWT returned.
- **`POST /auth/login` (valid credentials)**: Returns `HTTP 200 OK` with valid signed JWT.
- **`POST /auth/login` (invalid credentials)**: Correctly rejected with `HTTP 401 Unauthorized`.
- **`GET /api/secrets` (authenticated with valid JWT)**: Returns `HTTP 200 OK` (`{"secrets":[]}`).
- **`GET /api/secrets` (forged / tampered JWT)**: Correctly rejected with `HTTP 401 Unauthorized`.

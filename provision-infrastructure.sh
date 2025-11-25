#!/bin/bash

# SecretForge AI - Infrastructure Provisioning Script
# This script provisions D1, KV, and Vectorize resources on Cloudflare

set -e  # Exit on error

echo "🚀 SecretForge AI - Infrastructure Provisioning"
echo "================================================"
echo ""

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Check if pnpm wrangler is available
if ! pnpm wrangler --version &> /dev/null; then
    echo -e "${RED}❌ Error: wrangler not found${NC}"
    echo "Please run: pnpm install"
    exit 1
fi

# Check if logged in
echo -e "${BLUE}🔐 Checking Cloudflare login status...${NC}"
if ! pnpm wrangler whoami &> /dev/null; then
    echo -e "${YELLOW}⚠️  Not logged in to Cloudflare${NC}"
    echo "Running: pnpm wrangler login"
    pnpm wrangler login
fi

echo -e "${GREEN}✅ Logged in to Cloudflare${NC}"
echo ""

# ===========================
# 1. Provision D1 Database
# ===========================
echo -e "${BLUE}📊 Step 1: D1 Database (secretforge-db)${NC}"

# Check if database exists
if pnpm wrangler d1 list 2>&1 | grep -q "secretforge-db"; then
    echo -e "${YELLOW}⚠️  Database 'secretforge-db' already exists${NC}"
    echo "Fetching existing database ID..."

    # Get the database ID
    D1_ID=$(pnpm wrangler d1 list 2>&1 | grep -A 1 "secretforge-db" | grep "│" | tail -1 | awk '{print $2}')

    if [ -n "$D1_ID" ]; then
        echo -e "${GREEN}✅ Found D1 Database ID: $D1_ID${NC}"
    else
        echo -e "${RED}❌ Could not parse D1 ID. Please check manually:${NC}"
        echo "Run: pnpm wrangler d1 list"
        exit 1
    fi
else
    echo "Creating new D1 database..."
    CREATE_OUTPUT=$(pnpm wrangler d1 create secretforge-db 2>&1)

    # Extract database ID from output
    D1_ID=$(echo "$CREATE_OUTPUT" | grep -oP 'database_id\s*=\s*"\K[^"]+' | head -1)

    if [ -n "$D1_ID" ]; then
        echo -e "${GREEN}✅ Created D1 Database ID: $D1_ID${NC}"
    else
        echo -e "${RED}❌ Failed to create D1 database${NC}"
        echo "$CREATE_OUTPUT"
        exit 1
    fi
fi

echo ""

# ===========================
# 2. Provision KV Namespace
# ===========================
echo -e "${BLUE}🗄️  Step 2: KV Namespace (SECRETS_VAULT)${NC}"

# Correct wrangler KV syntax
CREATE_KV_OUTPUT=$(pnpm wrangler kv namespace create SECRETS_VAULT 2>&1 || true)

# Extract KV ID from output
KV_ID=$(echo "$CREATE_KV_OUTPUT" | grep -oP 'id\s*=\s*"\K[^"]+' | head -1)

if [ -n "$KV_ID" ]; then
    echo -e "${GREEN}✅ Created KV Namespace ID: $KV_ID${NC}"
else
    # Try to list existing namespaces
    echo -e "${YELLOW}⚠️  Checking for existing KV namespace...${NC}"

    KV_LIST=$(pnpm wrangler kv namespace list 2>&1 || echo "")

    if echo "$KV_LIST" | grep -q "SECRETS_VAULT"; then
        # Parse the ID from the list (this is approximate, adjust if needed)
        KV_ID=$(echo "$KV_LIST" | grep "SECRETS_VAULT" | grep -oP 'id:\s*\K\w+' | head -1)

        if [ -n "$KV_ID" ]; then
            echo -e "${GREEN}✅ Found existing KV Namespace ID: $KV_ID${NC}"
        else
            echo -e "${RED}❌ Could not parse KV ID${NC}"
            echo "Please check manually: pnpm wrangler kv namespace list"
            echo "Or create manually: pnpm wrangler kv namespace create SECRETS_VAULT"
            exit 1
        fi
    else
        echo -e "${RED}❌ Could not create or find KV namespace${NC}"
        echo "$CREATE_KV_OUTPUT"
        exit 1
    fi
fi

echo ""

# ===========================
# 3. Check Vectorize Index
# ===========================
echo -e "${BLUE}🧮 Step 3: Vectorize Index (api-docs-index)${NC}"

# Check if index exists
VECTORIZE_LIST=$(pnpm wrangler vectorize list 2>&1 || echo "")

if echo "$VECTORIZE_LIST" | grep -q "api-docs-index"; then
    echo -e "${GREEN}✅ Vectorize index 'api-docs-index' already exists${NC}"
    echo -e "${YELLOW}Note: Vectorize doesn't expose IDs in wrangler.toml, use index_name instead${NC}"
else
    echo "Creating Vectorize index..."
    pnpm wrangler vectorize create api-docs-index --dimensions=1536 --metric=cosine

    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✅ Created Vectorize index 'api-docs-index'${NC}"
    else
        echo -e "${RED}❌ Failed to create Vectorize index${NC}"
        exit 1
    fi
fi

echo ""
echo "================================================"
echo -e "${GREEN}✅ Infrastructure provisioning complete!${NC}"
echo "================================================"
echo ""
echo "📝 Summary:"
echo "  D1 Database ID:  $D1_ID"
echo "  KV Namespace ID: $KV_ID"
echo "  Vectorize Index: api-docs-index (no ID needed)"
echo ""
echo -e "${BLUE}🔧 Next steps:${NC}"
echo "  1. Update packages/api/wrangler.toml with these IDs"
echo "  2. Run: pnpm wrangler d1 execute secretforge-db --file=packages/api/schema.sql"
echo "  3. Deploy: pnpm --filter @secretforge/api deploy"
echo ""

# ===========================
# 4. Update wrangler.toml
# ===========================
read -p "Would you like to automatically update wrangler.toml? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    WRANGLER_FILE="packages/api/wrangler.toml"

    if [ -f "$WRANGLER_FILE" ]; then
        echo -e "${BLUE}📝 Updating $WRANGLER_FILE...${NC}"

        # Backup original
        cp "$WRANGLER_FILE" "$WRANGLER_FILE.backup"

        # Update database_id
        sed -i.tmp "s/database_id = \"YOUR_D1_DATABASE_ID\"/database_id = \"$D1_ID\"/" "$WRANGLER_FILE"

        # Update KV id
        sed -i.tmp "s/id = \"YOUR_KV_NAMESPACE_ID\"/id = \"$KV_ID\"/" "$WRANGLER_FILE"

        # Remove temp files
        rm -f "$WRANGLER_FILE.tmp"

        echo -e "${GREEN}✅ Updated $WRANGLER_FILE${NC}"
        echo -e "${YELLOW}⚠️  Backup saved to: $WRANGLER_FILE.backup${NC}"
    else
        echo -e "${RED}❌ Error: $WRANGLER_FILE not found${NC}"
    fi
fi

echo ""
echo -e "${GREEN}🎉 Done! Your infrastructure is ready.${NC}"

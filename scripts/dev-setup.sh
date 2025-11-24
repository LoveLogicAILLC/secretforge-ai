#!/usr/bin/env bash
set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "🚀 SecretForge AI - Development Environment Setup"
echo "=================================================="
echo ""

# Function to print colored output
info() {
  echo -e "${GREEN}[INFO]${NC} $1"
}

warn() {
  echo -e "${YELLOW}[WARN]${NC} $1"
}

error() {
  echo -e "${RED}[ERROR]${NC} $1"
  exit 1
}

# Check prerequisites
info "Checking prerequisites..."

command -v docker >/dev/null 2>&1 || error "Docker is required. Install from https://docker.com"
command -v docker-compose >/dev/null 2>&1 || error "Docker Compose is required"
command -v node >/dev/null 2>&1 || error "Node.js is required. Install from https://nodejs.org"

# Check Node version
NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 20 ]; then
  error "Node.js 20+ is required. Current version: $(node -v)"
fi

# Install pnpm if not present
if ! command -v pnpm >/dev/null 2>&1; then
  warn "pnpm not found. Installing pnpm 10..."
  npm install -g pnpm@10
fi

# Verify pnpm version
PNPM_VERSION=$(pnpm -v | cut -d'.' -f1)
if [ "$PNPM_VERSION" -lt 10 ]; then
  warn "pnpm 10+ recommended. Current version: $(pnpm -v). Upgrading..."
  npm install -g pnpm@10
fi

info "✅ All prerequisites satisfied"
echo ""

# Stop existing Docker services
info "Stopping existing Docker services..."
docker-compose down 2>/dev/null || true

# Start infrastructure
info "Starting Docker infrastructure (Ollama, PostgreSQL, Redis)..."
docker-compose up -d

# Wait for Ollama
info "Waiting for Ollama to be ready..."
OLLAMA_READY=false
for i in {1..30}; do
  if curl -f -s http://localhost:11434/api/tags >/dev/null 2>&1; then
    OLLAMA_READY=true
    break
  fi
  echo -n "."
  sleep 2
done
echo ""

if [ "$OLLAMA_READY" = false ]; then
  error "Ollama failed to start after 60 seconds"
fi

info "✅ Ollama is ready"

# Pull Ollama model
info "Pulling Llama 3.1 model (this may take a while)..."
docker exec secretforge-ollama ollama pull llama3.1:70b || warn "Failed to pull model. You can pull it later with: docker exec secretforge-ollama ollama pull llama3.1:70b"

# Setup environment variables
if [ ! -f .env ]; then
  info "Creating .env file from template..."
  cp .env.example .env
  
  # Generate encryption key
  ENCRYPTION_KEY=$(openssl rand -base64 32)
  
  # Update .env with generated key
  if [[ "$OSTYPE" == "darwin"* ]]; then
    sed -i '' "s|ENCRYPTION_KEY=.*|ENCRYPTION_KEY=${ENCRYPTION_KEY}|" .env
  else
    sed -i "s|ENCRYPTION_KEY=.*|ENCRYPTION_KEY=${ENCRYPTION_KEY}|" .env
  fi
  
  warn "⚠️  .env file created. Please edit it and add your API keys:"
  warn "   - OPENAI_API_KEY"
  warn "   - ANTHROPIC_API_KEY (optional)"
  echo ""
fi

# Install dependencies
info "Installing pnpm dependencies..."
pnpm install --frozen-lockfile

# Build packages
info "Building all packages..."
if ! pnpm build; then
  warn "Build failed. Some packages may have errors. Continuing..."
fi

# Run tests
info "Running tests..."
if ! pnpm test; then
  warn "Tests failed. Review the errors above."
fi

echo ""
info "✅ Development environment setup complete!"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "📋 Next Steps:"
echo ""
echo "1. Edit .env and add your API keys:"
echo "   ${YELLOW}nano .env${NC}"
echo ""
echo "2. Start development servers:"
echo "   ${GREEN}pnpm dev${NC}"
echo ""
echo "3. Or start individual packages:"
echo "   ${GREEN}pnpm --filter @secretforge/cli dev${NC}"
echo "   ${GREEN}pnpm --filter @secretforge/api dev${NC}"
echo "   ${GREEN}pnpm --filter @secretforge/web dev${NC}"
echo ""
echo "4. Test the CLI:"
echo "   ${GREEN}pnpm --filter @secretforge/cli start${NC}"
echo ""
echo "5. View Docker logs:"
echo "   ${GREEN}docker-compose logs -f${NC}"
echo ""
echo "📚 Documentation:"
echo "   - README.md"
echo "   - DEPLOYMENT_GUIDE.md"
echo "   - DESIGN_SYSTEM_GUIDE.md"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

#!/bin/bash
set -euo pipefail

# Railway Build Test Script
# Simulates Railway's Nixpacks build process locally
# This helps catch build issues before deploying to Railway

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

echo "🚂 Railway Build Test"
echo "===================="
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if Docker is available
if ! command -v docker &> /dev/null; then
    echo -e "${YELLOW}⚠️  Docker not found. Skipping Docker build test.${NC}"
    echo "   Install Docker to test Railway builds locally."
    exit 0
fi

# Check if Railway CLI is available (optional)
RAILWAY_CLI_AVAILABLE=false
if command -v railway &> /dev/null; then
    RAILWAY_CLI_AVAILABLE=true
fi

cd "$PROJECT_ROOT"

# Step 1: Clean previous builds
echo "🧹 Cleaning previous builds..."
rm -rf dist .nixpacks
echo -e "${GREEN}✓${NC} Cleaned build artifacts"

# Step 2: Validate configuration files
echo ""
echo "📋 Validating configuration files..."

# Check nixpacks.toml
if [ ! -f "nixpacks.toml" ]; then
    echo -e "${RED}✗${NC} nixpacks.toml not found"
    exit 1
fi
echo -e "${GREEN}✓${NC} nixpacks.toml exists"

# Check railway.json
if [ ! -f "railway.json" ]; then
    echo -e "${RED}✗${NC} railway.json not found"
    exit 1
fi
echo -e "${GREEN}✓${NC} railway.json exists"

# Check package.json
if [ ! -f "package.json" ]; then
    echo -e "${RED}✗${NC} package.json not found"
    exit 1
fi
echo -e "${GREEN}✓${NC} package.json exists"

# Step 3: Validate Node version compatibility
echo ""
echo "🔍 Checking Node.js version compatibility..."
NODE_VERSION=$(node -v 2>/dev/null || echo "not found")
if [ "$NODE_VERSION" = "not found" ]; then
    echo -e "${YELLOW}⚠️  Node.js not found locally${NC}"
else
    echo -e "${GREEN}✓${NC} Node.js version: $NODE_VERSION"
fi

# Step 4: Test npm install
echo ""
echo "📦 Testing npm install..."
if npm ci --prefer-offline --no-audit 2>&1 | tee /tmp/npm-install.log; then
    echo -e "${GREEN}✓${NC} npm install succeeded"
else
    echo -e "${RED}✗${NC} npm install failed"
    echo "   Check /tmp/npm-install.log for details"
    exit 1
fi

# Step 5: Test build process
echo ""
echo "🔨 Testing build process..."
if npm run build 2>&1 | tee /tmp/build.log; then
    echo -e "${GREEN}✓${NC} Build succeeded"
else
    echo -e "${RED}✗${NC} Build failed"
    echo "   Check /tmp/build.log for details"
    exit 1
fi

# Step 6: Validate build output
echo ""
echo "✅ Validating build output..."
if [ ! -d "dist" ]; then
    echo -e "${RED}✗${NC} dist/ directory not found"
    exit 1
fi

if [ ! -f "dist/index.cjs" ]; then
    echo -e "${RED}✗${NC} dist/index.cjs not found"
    exit 1
fi

if [ ! -d "dist/public" ]; then
    echo -e "${RED}✗${NC} dist/public/ directory not found"
    exit 1
fi

if [ ! -f "dist/public/index.html" ]; then
    echo -e "${RED}✗${NC} dist/public/index.html not found"
    exit 1
fi

echo -e "${GREEN}✓${NC} Build output validated"

# Step 7: Test Docker build (simulates Railway)
echo ""
echo "🐳 Testing Docker build (simulates Railway Nixpacks)..."
echo "   This may take a few minutes..."

# Create a temporary Dockerfile for testing
cat > /tmp/test-railway.Dockerfile << 'EOF'
# Test Dockerfile that simulates Railway's Nixpacks build
FROM nixos/nix:latest

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY nixpacks.toml ./
COPY railway.json ./

# Copy source files
COPY . .

# Install Node.js and npm via Nix (simulating Nixpacks)
RUN nix-env -iA nixpkgs.nodejs-20_x nixpkgs.npm-10_x

# Run install and build
RUN npm ci --prefer-offline --no-audit
RUN npm run build

# Verify build output
RUN test -f dist/index.cjs && test -d dist/public && test -f dist/public/index.html

CMD ["node", "dist/index.cjs"]
EOF

if docker build -f /tmp/test-railway.Dockerfile -t railway-build-test:latest . 2>&1 | tee /tmp/docker-build.log; then
    echo -e "${GREEN}✓${NC} Docker build succeeded"
    docker rmi railway-build-test:latest 2>/dev/null || true
else
    echo -e "${RED}✗${NC} Docker build failed"
    echo "   Check /tmp/docker-build.log for details"
    echo ""
    echo "   Common issues:"
    echo "   - Outdated Nix package references"
    echo "   - Missing dependencies"
    echo "   - Build script errors"
    rm -f /tmp/test-railway.Dockerfile
    exit 1
fi

rm -f /tmp/test-railway.Dockerfile

# Step 8: Run pre-deployment checks
echo ""
echo "🔍 Running pre-deployment checks..."
if node scripts/pre-deploy-check.js; then
    echo -e "${GREEN}✓${NC} Pre-deployment checks passed"
else
    echo -e "${RED}✗${NC} Pre-deployment checks failed"
    exit 1
fi

# Summary
echo ""
echo "=========================================="
echo -e "${GREEN}✅ All Railway build tests passed!${NC}"
echo "=========================================="
echo ""
echo "Your build is ready for Railway deployment."
if [ "$RAILWAY_CLI_AVAILABLE" = true ]; then
    echo ""
    echo "To deploy:"
    echo "  railway up"
fi

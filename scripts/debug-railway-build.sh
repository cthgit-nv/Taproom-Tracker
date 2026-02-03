#!/bin/bash
set -euo pipefail

# Railway Build Debugging Script
# Helps diagnose and fix Railway deployment issues
# Run this when Railway builds fail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$PROJECT_ROOT"

echo "🔧 Railway Build Debugger"
echo "========================"
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Diagnostic information
echo -e "${BLUE}📊 Diagnostic Information${NC}"
echo "=========================="
echo ""

# System info
echo "System Information:"
echo "  OS: $(uname -s)"
echo "  Architecture: $(uname -m)"
if command -v node &> /dev/null; then
    echo "  Node.js: $(node -v)"
else
    echo -e "  Node.js: ${RED}not found${NC}"
fi
if command -v npm &> /dev/null; then
    echo "  npm: $(npm -v)"
else
    echo -e "  npm: ${RED}not found${NC}"
fi
if command -v docker &> /dev/null; then
    echo "  Docker: $(docker --version)"
else
    echo -e "  Docker: ${YELLOW}not found${NC} (optional for local testing)"
fi
echo ""

# Configuration files
echo -e "${BLUE}📋 Configuration Files${NC}"
echo "======================"
echo ""

check_file() {
    local file=$1
    if [ -f "$file" ]; then
        echo -e "  ${GREEN}✓${NC} $file exists"
        if [ "$file" = "nixpacks.toml" ]; then
            echo "    Content:"
            cat "$file" | sed 's/^/      /'
        elif [ "$file" = "railway.json" ]; then
            echo "    Content:"
            cat "$file" | jq . 2>/dev/null | sed 's/^/      /' || cat "$file" | sed 's/^/      /'
        fi
    else
        echo -e "  ${RED}✗${NC} $file missing"
    fi
    echo ""
}

check_file "nixpacks.toml"
check_file "railway.json"
check_file "package.json"

# Check for common issues
echo -e "${BLUE}🔍 Common Issues Check${NC}"
echo "======================"
echo ""

ISSUES_FOUND=0

# Issue 1: Stale .nixpacks directory
if [ -d ".nixpacks" ]; then
    echo -e "${YELLOW}⚠️  Issue 1: Stale .nixpacks directory found${NC}"
    echo "   The .nixpacks directory contains auto-generated Nix files that may be outdated."
    echo "   Solution: Add .nixpacks to .gitignore and remove the directory"
    echo "   Command: rm -rf .nixpacks"
    echo ""
    ISSUES_FOUND=$((ISSUES_FOUND + 1))
fi

# Issue 2: Outdated Node.js reference
if grep -q "nodejs-[0-9]" nixpacks.toml 2>/dev/null; then
    NODE_REF=$(grep -o "nodejs-[0-9_]*" nixpacks.toml | head -1)
    if [[ ! "$NODE_REF" =~ nodejs-20 ]]; then
        echo -e "${YELLOW}⚠️  Issue 2: Outdated Node.js reference${NC}"
        echo "   Found: $NODE_REF"
        echo "   Recommended: nodejs-20_x"
        echo "   Update nixpacks.toml to use nodejs-20_x"
        echo ""
        ISSUES_FOUND=$((ISSUES_FOUND + 1))
    fi
fi

# Issue 3: Missing npm reference
if ! grep -q "npm" nixpacks.toml 2>/dev/null; then
    echo -e "${YELLOW}⚠️  Issue 3: Missing npm package${NC}"
    echo "   nixpacks.toml should include npm in nixPkgs"
    echo "   Add: nixPkgs = [\"nodejs-20_x\", \"npm-10_x\"]"
    echo ""
    ISSUES_FOUND=$((ISSUES_FOUND + 1))
fi

# Issue 4: Build script issues
if [ -f "package.json" ]; then
    if ! grep -q '"build"' package.json; then
        echo -e "${RED}✗ Issue 4: Missing build script${NC}"
        echo "   package.json must have a 'build' script"
        echo ""
        ISSUES_FOUND=$((ISSUES_FOUND + 1))
    fi
    
    if ! grep -q '"start"' package.json; then
        echo -e "${RED}✗ Issue 5: Missing start script${NC}"
        echo "   package.json must have a 'start' script"
        echo ""
        ISSUES_FOUND=$((ISSUES_FOUND + 1))
    fi
fi

# Issue 5: Package lock file
if [ ! -f "package-lock.json" ]; then
    echo -e "${YELLOW}⚠️  Issue 6: Missing package-lock.json${NC}"
    echo "   Railway uses 'npm ci' which requires package-lock.json"
    echo "   Run: npm install"
    echo ""
    ISSUES_FOUND=$((ISSUES_FOUND + 1))
fi

if [ $ISSUES_FOUND -eq 0 ]; then
    echo -e "${GREEN}✓${NC} No common issues found"
    echo ""
fi

# Test local build
echo -e "${BLUE}🧪 Local Build Test${NC}"
echo "=================="
echo ""

read -p "Run local build test? (y/n) " -n 1 -r
echo ""
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo "Running build test..."
    if npm ci --prefer-offline --no-audit && npm run build; then
        echo -e "${GREEN}✓${NC} Local build succeeded"
    else
        echo -e "${RED}✗${NC} Local build failed"
        echo "   Fix local build issues before deploying to Railway"
    fi
fi

# Recommendations
echo ""
echo -e "${BLUE}💡 Recommendations${NC}"
echo "=================="
echo ""
echo "1. Always test builds locally before deploying:"
echo "   ./scripts/test-build-autonomous.sh"
echo ""
echo "2. Use the Railway build test script:"
echo "   ./scripts/test-railway-build.sh"
echo ""
echo "3. Check Railway logs for specific errors:"
echo "   railway logs"
echo ""
echo "4. Ensure .nixpacks is in .gitignore:"
echo "   echo '.nixpacks' >> .gitignore"
echo ""
echo "5. Update nixpacks.toml if using outdated packages:"
echo "   Use 'nodejs-20_x' and 'npm-10_x' for stable builds"
echo ""

# Generate debug report
DEBUG_REPORT="/tmp/railway-debug-$(date +%s).txt"
{
    echo "Railway Build Debug Report"
    echo "Generated: $(date)"
    echo ""
    echo "=== System Information ==="
    uname -a
    echo ""
    echo "=== Node.js Version ==="
    node -v 2>/dev/null || echo "Not found"
    echo ""
    echo "=== npm Version ==="
    npm -v 2>/dev/null || echo "Not found"
    echo ""
    echo "=== nixpacks.toml ==="
    cat nixpacks.toml 2>/dev/null || echo "Not found"
    echo ""
    echo "=== railway.json ==="
    cat railway.json 2>/dev/null || echo "Not found"
    echo ""
    echo "=== package.json scripts ==="
    cat package.json | jq '.scripts' 2>/dev/null || echo "Error reading scripts"
} > "$DEBUG_REPORT"

echo -e "${GREEN}✓${NC} Debug report saved to: $DEBUG_REPORT"
echo ""

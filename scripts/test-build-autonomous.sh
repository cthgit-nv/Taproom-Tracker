#!/bin/bash
set -euo pipefail

# Autonomous Build Test Script
# Runs comprehensive build tests without user interaction
# Designed to catch issues before Railway deployment

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$PROJECT_ROOT"

# Output file for test results
TEST_RESULTS="/tmp/build-test-results-$(date +%s).json"
ERRORS=0
WARNINGS=0

# Initialize results
cat > "$TEST_RESULTS" << 'EOF'
{
  "timestamp": "",
  "tests": [],
  "summary": {
    "total": 0,
    "passed": 0,
    "failed": 0,
    "warnings": 0
  }
}
EOF

# Helper function to add test result
add_test_result() {
    local name=$1
    local status=$2
    local message=$3
    local details=$4
    
    if [ "$USE_JQ" = true ]; then
        # Update JSON using jq
        local temp_file=$(mktemp)
        cat "$TEST_RESULTS" | jq --arg name "$name" \
            --arg status "$status" \
            --arg message "$message" \
            --arg details "$details" \
            '.tests += [{"name": $name, "status": $status, "message": $message, "details": $details}]' \
            > "$temp_file" 2>/dev/null
        if [ $? -eq 0 ]; then
            mv "$temp_file" "$TEST_RESULTS"
        fi
    fi
    
    if [ "$status" = "failed" ]; then
        ((ERRORS++))
    elif [ "$status" = "warning" ]; then
        ((WARNINGS++))
    fi
}

# Check if jq is available
USE_JQ=false
if command -v jq &> /dev/null; then
    USE_JQ=true
else
    echo "⚠️  jq not found. Using simple text output (JSON results disabled)"
fi

echo "🤖 Autonomous Build Test Suite"
echo "=============================="
echo ""

# Test 1: Configuration Files
echo "Test 1: Configuration Files"
if [ -f "nixpacks.toml" ] && [ -f "railway.json" ] && [ -f "package.json" ]; then
    echo "  ✓ All configuration files present"
    if [ "$USE_JQ" = true ]; then
        add_test_result "config_files" "passed" "All configuration files present" ""
    fi
else
    echo "  ✗ Missing configuration files"
    if [ "$USE_JQ" = true ]; then
        add_test_result "config_files" "failed" "Missing configuration files" ""
    fi
    exit 1
fi

# Test 2: Package.json Validation
echo ""
echo "Test 2: Package.json Validation"
if node -e "require('./package.json')" 2>/dev/null; then
    echo "  ✓ package.json is valid JSON"
    if [ "$USE_JQ" = true ]; then
        add_test_result "package_json" "passed" "package.json is valid" ""
    fi
else
    echo "  ✗ package.json is invalid"
    if [ "$USE_JQ" = true ]; then
        add_test_result "package_json" "failed" "package.json is invalid JSON" ""
    fi
    exit 1
fi

# Test 3: Nixpacks Configuration
echo ""
echo "Test 3: Nixpacks Configuration"
if grep -q "nodejs-20_x" nixpacks.toml 2>/dev/null; then
    echo "  ✓ nixpacks.toml references Node.js 20"
    if [ "$USE_JQ" = true ]; then
        add_test_result "nixpacks_config" "passed" "nixpacks.toml configured correctly" ""
    fi
else
    echo "  ⚠️  nixpacks.toml may have outdated Node.js reference"
    if [ "$USE_JQ" = true ]; then
        add_test_result "nixpacks_config" "warning" "Node.js version may be outdated" ""
    fi
fi

# Test 4: Dependencies Installation
echo ""
echo "Test 4: Dependencies Installation"
if npm ci --prefer-offline --no-audit --silent 2>&1 | tee /tmp/npm-ci.log; then
    echo "  ✓ Dependencies installed successfully"
    if [ "$USE_JQ" = true ]; then
        add_test_result "dependencies" "passed" "npm ci succeeded" ""
    fi
else
    echo "  ✗ Dependency installation failed"
    if [ "$USE_JQ" = true ]; then
        add_test_result "dependencies" "failed" "npm ci failed" "$(cat /tmp/npm-ci.log | tail -20)"
    fi
    exit 1
fi

# Test 5: TypeScript Type Check
echo ""
echo "Test 5: TypeScript Type Check"
if npm run check 2>&1 | tee /tmp/typecheck.log; then
    echo "  ✓ TypeScript type check passed"
    if [ "$USE_JQ" = true ]; then
        add_test_result "typecheck" "passed" "TypeScript validation passed" ""
    fi
else
    echo "  ✗ TypeScript type check failed"
    if [ "$USE_JQ" = true ]; then
        add_test_result "typecheck" "failed" "TypeScript errors found" "$(cat /tmp/typecheck.log | tail -30)"
    fi
    exit 1
fi

# Test 6: Build Process
echo ""
echo "Test 6: Build Process"
if npm run build 2>&1 | tee /tmp/build.log; then
    echo "  ✓ Build completed successfully"
    if [ "$USE_JQ" = true ]; then
        add_test_result "build" "passed" "Build succeeded" ""
    fi
else
    echo "  ✗ Build failed"
    if [ "$USE_JQ" = true ]; then
        add_test_result "build" "failed" "Build process failed" "$(cat /tmp/build.log | tail -50)"
    fi
    exit 1
fi

# Test 7: Build Output Validation
echo ""
echo "Test 7: Build Output Validation"
BUILD_ERRORS=0

if [ ! -d "dist" ]; then
    echo "  ✗ dist/ directory missing"
    BUILD_ERRORS=$((BUILD_ERRORS + 1))
fi

if [ ! -f "dist/index.cjs" ]; then
    echo "  ✗ dist/index.cjs missing"
    BUILD_ERRORS=$((BUILD_ERRORS + 1))
fi

if [ ! -d "dist/public" ]; then
    echo "  ✗ dist/public/ directory missing"
    BUILD_ERRORS=$((BUILD_ERRORS + 1))
fi

if [ ! -f "dist/public/index.html" ]; then
    echo "  ✗ dist/public/index.html missing"
    BUILD_ERRORS=$((BUILD_ERRORS + 1))
fi

if [ $BUILD_ERRORS -eq 0 ]; then
    echo "  ✓ All build outputs present"
    if [ "$USE_JQ" = true ]; then
        add_test_result "build_output" "passed" "All required build outputs exist" ""
    fi
else
    echo "  ✗ Build output validation failed ($BUILD_ERRORS errors)"
    if [ "$USE_JQ" = true ]; then
        add_test_result "build_output" "failed" "Missing build outputs" "$BUILD_ERRORS files/directories missing"
    fi
    exit 1
fi

# Test 8: Pre-deployment Check
echo ""
echo "Test 8: Pre-deployment Check"
if node scripts/pre-deploy-check.js 2>&1 | tee /tmp/predeploy.log; then
    echo "  ✓ Pre-deployment checks passed"
    if [ "$USE_JQ" = true ]; then
        add_test_result "predeploy" "passed" "Pre-deployment validation passed" ""
    fi
else
    echo "  ✗ Pre-deployment checks failed"
    if [ "$USE_JQ" = true ]; then
        add_test_result "predeploy" "failed" "Pre-deployment validation failed" "$(cat /tmp/predeploy.log | tail -30)"
    fi
    exit 1
fi

# Test 9: Check for outdated Nix references (if .nixpacks exists)
echo ""
echo "Test 9: Nix Package References"
if [ -d ".nixpacks" ]; then
    echo "  ⚠️  .nixpacks directory found (should be gitignored)"
    NIX_FILES=$(find .nixpacks -name "*.nix" 2>/dev/null | wc -l)
    if [ "$NIX_FILES" -gt 0 ]; then
        echo "  ⚠️  Found $NIX_FILES Nix files (may be outdated)"
        if [ "$USE_JQ" = true ]; then
            add_test_result "nix_references" "warning" "Stale .nixpacks files found" "$NIX_FILES files"
        fi
    fi
else
    echo "  ✓ No stale .nixpacks directory"
    if [ "$USE_JQ" = true ]; then
        add_test_result "nix_references" "passed" "No stale Nix files" ""
    fi
fi

# Final Summary
echo ""
echo "=========================================="
if [ $ERRORS -eq 0 ]; then
    echo "✅ All tests passed!"
    if [ "$USE_JQ" = true ]; then
        # Update summary in JSON
        local temp_file=$(mktemp)
        cat "$TEST_RESULTS" | jq --arg timestamp "$(date -u +%ISO8601)" \
            '.timestamp = $timestamp | 
             .summary.total = (.tests | length) |
             .summary.passed = ([.tests[] | select(.status == "passed")] | length) |
             .summary.failed = ([.tests[] | select(.status == "failed")] | length) |
             .summary.warnings = ([.tests[] | select(.status == "warning")] | length)' \
            > "$temp_file" 2>/dev/null
        if [ $? -eq 0 ]; then
            mv "$temp_file" "$TEST_RESULTS"
            echo ""
            echo "Test results saved to: $TEST_RESULTS"
            cat "$TEST_RESULTS" | jq '.summary' 2>/dev/null || true
        fi
    fi
    exit 0
else
    echo "❌ Tests failed ($ERRORS errors, $WARNINGS warnings)"
    if [ "$USE_JQ" = true ]; then
        echo ""
        echo "Test results saved to: $TEST_RESULTS"
        cat "$TEST_RESULTS" | jq '.tests[] | select(.status == "failed")' 2>/dev/null || true
    fi
    exit 1
fi

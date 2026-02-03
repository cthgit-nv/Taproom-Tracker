# Quick Start: Testing Railway Builds

## Before Every Deployment

Run these commands in order:

```bash
# 1. Comprehensive autonomous testing (recommended)
npm run test:autonomous

# 2. Test Railway build process (if Docker available)
npm run test:railway

# 3. Pre-deployment validation
npm run test:build
```

## When Railway Builds Fail

```bash
# Diagnose the issue
npm run debug:railway

# Check for common problems:
# - Stale .nixpacks directory → rm -rf .nixpacks
# - Outdated Node.js reference → Update nixpacks.toml
# - Missing files → Check pre-deploy-check.js output
```

## Available Commands

- `npm run test:autonomous` - Full autonomous test suite
- `npm run test:railway` - Simulate Railway build locally
- `npm run debug:railway` - Diagnose build issues
- `npm run test:build` - Quick build + validation

## Common Fixes

1. **Remove stale Nix files**: `rm -rf .nixpacks`
2. **Update nixpacks.toml**: Use `nodejs-20_x` and `npm-10_x`
3. **Clean build**: `rm -rf dist node_modules && npm ci && npm run build`

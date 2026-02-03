# Railway Build Reliability Guide

This document describes the comprehensive testing and debugging system implemented to ensure reliable Railway deployments.

## Problem Statement

Railway deployments were failing due to:
- Outdated Nix package specifications in auto-generated `.nixpacks` files
- Missing validation before deployment
- No local testing capability to catch issues early
- Difficult debugging process requiring manual error copying from Railway

## Solution Overview

We've implemented a comprehensive testing and debugging scheme that:
1. **Tests builds locally** before deploying to Railway
2. **Validates configurations** to catch issues early
3. **Simulates Railway builds** using Docker
4. **Provides autonomous testing** that can run in CI/CD
5. **Offers debugging tools** to diagnose issues quickly

## Tools and Scripts

### 1. `scripts/test-build-autonomous.sh`
**Purpose**: Comprehensive autonomous build testing

**Usage**:
```bash
npm run test:autonomous
# or
./scripts/test-build-autonomous.sh
```

**What it does**:
- Validates all configuration files
- Tests dependency installation
- Runs TypeScript type checking
- Executes full build process
- Validates build output
- Runs pre-deployment checks
- Checks for stale Nix files
- Generates test results report

**When to use**: Before every commit, in CI/CD pipelines, or when you want comprehensive validation.

### 2. `scripts/test-railway-build.sh`
**Purpose**: Simulates Railway's Nixpacks build process locally

**Usage**:
```bash
npm run test:railway
# or
./scripts/test-railway-build.sh
```

**What it does**:
- Cleans previous builds
- Validates configuration files
- Tests npm install
- Tests build process
- Validates build output
- **Runs Docker build** (simulates Railway's Nixpacks)
- Runs pre-deployment checks

**When to use**: When you want to test the exact build process Railway uses, or before deploying to Railway.

**Requirements**: Docker must be installed for full testing.

### 3. `scripts/debug-railway-build.sh`
**Purpose**: Diagnose Railway build issues

**Usage**:
```bash
npm run debug:railway
# or
./scripts/debug-railway-build.sh
```

**What it does**:
- Collects system information
- Validates configuration files
- Checks for common issues:
  - Stale `.nixpacks` directory
  - Outdated Node.js references
  - Missing npm package
  - Build script issues
  - Missing package-lock.json
- Provides recommendations
- Generates debug report

**When to use**: When Railway builds fail and you need to diagnose the issue.

### 4. Enhanced `scripts/pre-deploy-check.js`
**Purpose**: Pre-deployment validation

**Usage**:
```bash
node scripts/pre-deploy-check.js
# or automatically via
npm run test:build
```

**What it does**:
- Validates build output
- Checks required files
- Validates package.json scripts
- Validates railway.json configuration
- **Validates nixpacks.toml** (NEW)
- Checks for stale `.nixpacks` artifacts (NEW)
- Validates static file structure

## Configuration Files

### `nixpacks.toml`
Updated with stable package references:
```toml
[phases.setup]
nixPkgs = ["nodejs-20_x", "npm-10_x"]

[phases.install]
cmds = ["npm ci --prefer-offline --no-audit"]

[phases.build]
cmds = ["npm run build"]

[variables]
NODE_ENV = "production"
```

**Key improvements**:
- Explicit npm version (`npm-10_x`) for stability
- `--prefer-offline` flag to reduce network issues
- `--no-audit` to speed up builds
- Production environment variable

### `.gitignore`
Added `.nixpacks` directory to prevent committing stale auto-generated files.

## GitHub Actions Workflow

The `.github/workflows/railway-deploy.yml` workflow now includes:
1. **Test job**: Runs all validation and build tests
2. **Deploy job**: Only runs if tests pass and on main/master branch
3. **Better error handling**: Clear error messages and exit codes
4. **Configuration validation**: Checks for required files before deployment

## Common Issues and Solutions

### Issue: "nix-env -if" fails with exit code 1

**Cause**: Outdated Nix package specifications in auto-generated `.nixpacks` files.

**Solution**:
1. Remove stale `.nixpacks` directory: `rm -rf .nixpacks`
2. Ensure `.nixpacks` is in `.gitignore`
3. Update `nixpacks.toml` with stable package references
4. Run `npm run test:railway` to verify locally

### Issue: Build fails with "package not found"

**Cause**: Outdated package references in `nixpacks.toml`.

**Solution**:
1. Update `nixpacks.toml` to use current package versions
2. Use `nodejs-20_x` and `npm-10_x` for stability
3. Run `npm run debug:railway` to check for issues

### Issue: Railway build succeeds but deployment fails

**Cause**: Build output validation issues or missing files.

**Solution**:
1. Run `npm run test:autonomous` to validate build output
2. Check `scripts/pre-deploy-check.js` output
3. Verify `dist/index.cjs` and `dist/public/index.html` exist

## Best Practices

1. **Always test locally before deploying**:
   ```bash
   npm run test:autonomous
   ```

2. **Test Railway build process locally** (if Docker available):
   ```bash
   npm run test:railway
   ```

3. **Run pre-deployment checks**:
   ```bash
   npm run test:build
   ```

4. **Debug issues immediately**:
   ```bash
   npm run debug:railway
   ```

5. **Never commit `.nixpacks` directory** - it's auto-generated and may contain stale files.

6. **Keep `nixpacks.toml` updated** with stable package references.

## CI/CD Integration

The autonomous test script is designed to run in CI/CD environments:
- No user interaction required
- Clear exit codes (0 = success, 1 = failure)
- JSON output for programmatic parsing (if `jq` available)
- Comprehensive error reporting

Example GitHub Actions usage:
```yaml
- name: Run build tests
  run: ./scripts/test-build-autonomous.sh
```

## Monitoring and Alerts

The test scripts provide:
- Clear success/failure indicators
- Detailed error messages
- Test result reports (JSON format when `jq` available)
- Debug reports for troubleshooting

## Future Improvements

Potential enhancements:
- Integration with Railway webhooks for automatic testing
- Slack/email notifications on build failures
- Automated rollback on deployment failure
- Build artifact caching for faster builds
- Parallel test execution for faster feedback

## Support

If you encounter issues:
1. Run `npm run debug:railway` to diagnose
2. Check Railway logs: `railway logs`
3. Review test output for specific error messages
4. Ensure all configuration files are up to date

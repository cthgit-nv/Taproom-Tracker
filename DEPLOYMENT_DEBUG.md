# Railway Deployment Debugging Guide

This guide helps you troubleshoot common Railway deployment issues and provides step-by-step debugging procedures.

## Quick Debug Checklist

- [ ] Check Railway build logs for errors
- [ ] Verify environment variables are set correctly
- [ ] Test build locally: `npm run build`
- [ ] Test startup locally: `npm run test:start`
- [ ] Check Railway service logs for runtime errors
- [ ] Verify database connection
- [ ] Check health endpoint: `https://your-app.up.railway.app/health`

## Common Errors & Solutions

### 1. Build Failures

#### Error: "Cannot find module" or "Module not found"

**Symptoms:**
- Build fails with module resolution errors
- Missing dependencies in build output

**Solutions:**
1. Verify all dependencies are in `package.json`:
   ```bash
   npm install
   npm run build
   ```

2. Check that `node_modules` is not in `.gitignore` incorrectly

3. Ensure Railway is using the correct Node.js version (defaults to Node 20)

4. Clear Railway build cache:
   - Go to Railway project → Settings → Clear Build Cache
   - Redeploy

#### Error: "Build command failed"

**Symptoms:**
- Build process exits with non-zero code
- TypeScript compilation errors

**Solutions:**
1. Run build locally to see exact error:
   ```bash
   npm run build
   ```

2. Check TypeScript errors:
   ```bash
   npm run check
   ```

3. Verify build script in `package.json`:
   ```json
   "build": "tsx script/build.ts"
   ```

4. Check `railway.json` build command matches `package.json`

#### Error: "Static files not found" or "dist/public does not exist"

**Symptoms:**
- Build completes but app fails to start
- Error: "Could not find the build directory"

**Solutions:**
1. Verify build creates both server and client:
   - `dist/index.cjs` (server)
   - `dist/public/` (client)

2. Check build script runs both:
   - Vite build (client)
   - esbuild (server)

3. Run pre-deploy check:
   ```bash
   npm run test:build
   ```

### 2. Application Startup Failures

#### Error: "SESSION_SECRET environment variable is required"

**Symptoms:**
- App crashes immediately on startup
- Error in logs about missing SESSION_SECRET

**Solutions:**
1. Set `SESSION_SECRET` in Railway:
   - Go to Railway project → Variables
   - Add: `SESSION_SECRET=<your-secret>`
   - Generate secret: `openssl rand -base64 32`

2. Redeploy after adding environment variable

#### Error: "DATABASE_URL must be set"

**Symptoms:**
- Database connection errors
- App fails to connect to PostgreSQL

**Solutions:**
1. Verify PostgreSQL service is added to Railway project
2. Check `DATABASE_URL` is automatically set by Railway
3. If using external database, ensure `DATABASE_URL` is set correctly
4. Format: `postgresql://user:password@host:port/database`

#### Error: "Port already in use" or "EADDRINUSE"

**Symptoms:**
- App fails to bind to port
- Connection refused errors

**Solutions:**
1. Railway automatically sets `PORT` environment variable
2. Don't hardcode port - use `process.env.PORT || "5000"`
3. Verify app listens on `0.0.0.0` (not `localhost`)

#### Error: "Cannot find module" at runtime

**Symptoms:**
- App starts but crashes when accessing routes
- Missing module errors in logs

**Solutions:**
1. Check esbuild bundling includes all dependencies
2. Verify `allowlist` in `script/build.ts` includes required modules
3. Check external dependencies are correctly marked

### 3. Static File Serving Issues

#### Error: "404 Not Found" for frontend assets

**Symptoms:**
- Frontend loads but assets (JS, CSS) return 404
- Blank page or broken styling

**Solutions:**
1. Verify `dist/public/` exists after build
2. Check `server/static.ts` path resolution
3. Test locally:
   ```bash
   npm run build
   npm run test:start
   # Visit http://localhost:5000
   ```

4. Check Railway logs for static file path errors

#### Error: "dist/public/index.html not found"

**Symptoms:**
- All routes return 404
- SPA routing not working

**Solutions:**
1. Verify Vite build completes successfully
2. Check `vite.config.ts` output directory: `dist/public`
3. Ensure `index.html` exists in `dist/public/`

### 4. Database Connection Issues

#### Error: "Connection refused" or "ECONNREFUSED"

**Symptoms:**
- Database queries fail
- Connection timeout errors

**Solutions:**
1. Verify PostgreSQL service is running in Railway
2. Check `DATABASE_URL` format is correct
3. Verify database credentials
4. Check if database needs to be provisioned:
   ```bash
   railway run npm run db:push
   ```

#### Error: "relation does not exist" or schema errors

**Symptoms:**
- App starts but database queries fail
- Table not found errors

**Solutions:**
1. Run database migrations:
   ```bash
   railway run npm run db:push
   ```

2. Or use Railway CLI:
   ```bash
   railway link
   railway run npm run db:push
   ```

### 5. GitHub Integration Issues

#### Error: "Repository not found" or access denied

**Symptoms:**
- Railway can't access GitHub repository
- Deployment doesn't trigger on push

**Solutions:**
1. Verify GitHub repository is public or Railway has access
2. Check Railway project settings → Source
3. Reconnect repository if needed
4. Verify Railway GitHub app has repository access

#### Error: "Deployment not triggering"

**Symptoms:**
- Pushing to GitHub doesn't deploy
- Manual deploy required

**Solutions:**
1. Check Railway auto-deploy settings:
   - Project → Settings → Source
   - Verify branch is correct (usually `main` or `master`)

2. Check GitHub webhook is configured:
   - Railway should create webhook automatically
   - Verify in GitHub: Settings → Webhooks

3. Enable "Wait for CI" if using GitHub Actions

## Step-by-Step Debugging Process

### Step 1: Check Railway Build Logs

1. Go to Railway dashboard
2. Select your project → Deployments
3. Click on latest deployment
4. View build logs
5. Look for error messages or failed steps

### Step 2: Check Railway Runtime Logs

1. Go to Railway dashboard
2. Select your service
3. Click "View Logs" or "Logs" tab
4. Filter by error level or search for keywords
5. Look for stack traces or error messages

### Step 3: Test Locally

Reproduce the issue locally:

```bash
# 1. Clean build
rm -rf dist node_modules
npm install

# 2. Build
npm run build

# 3. Verify build output
ls -la dist/
ls -la dist/public/

# 4. Test with production environment
NODE_ENV=production \
DATABASE_URL=your_local_db_url \
SESSION_SECRET=test-secret \
npm start
```

### Step 4: Run Pre-Deployment Checks

```bash
npm run test:build
```

This validates:
- Build output structure
- Required files exist
- Configuration is correct
- Static files are present

### Step 5: Check Environment Variables

1. Railway dashboard → Project → Variables
2. Verify all required variables are set:
   - `DATABASE_URL` (auto-set by Railway if using Railway PostgreSQL)
   - `SESSION_SECRET` (required in production)
   - `NODE_ENV=production` (optional, Railway sets this)

3. Check variable names match exactly (case-sensitive)

### Step 6: Verify Health Endpoint

Once deployed, check health endpoint:

```bash
curl https://your-app.up.railway.app/health
```

Should return:
```json
{
  "status": "ok",
  "timestamp": "2024-...",
  "uptime": 123.45
}
```

## Railway CLI Debugging

### Install Railway CLI

```bash
npm install -g @railway/cli
```

### Login and Link Project

```bash
railway login
railway link
```

### View Logs

```bash
# Real-time logs
railway logs

# Follow logs
railway logs --follow

# Filter logs
railway logs | grep "error"
```

### Run Commands

```bash
# Run database migrations
railway run npm run db:push

# Test build
railway run npm run build

# Check environment
railway run env
```

### Check Service Status

```bash
railway status
```

## Viewing Logs in Railway Dashboard

### Build Logs

1. Go to Deployments tab
2. Click on a deployment
3. View "Build Logs" section
4. Look for:
   - npm install output
   - Build command execution
   - Error messages

### Runtime Logs

1. Go to your service
2. Click "Logs" or "View Logs"
3. Use filters:
   - Search by keyword
   - Filter by log level
   - Filter by time range

### Log Explorer (Advanced)

1. Go to Observability tab
2. Use Log Explorer for advanced filtering:
   - HTTP status codes
   - Error types
   - Custom attributes

## Rollback Procedure

If deployment fails:

1. Go to Railway → Deployments
2. Find last working deployment
3. Click "Redeploy" or "Rollback"
4. Monitor new deployment logs

## Getting Help

### Railway Resources

- **Documentation**: https://docs.railway.app
- **Status Page**: https://status.railway.app
- **Discord**: https://discord.gg/railway
- **Help Station**: https://station.railway.com

### Debugging Checklist

Before asking for help, gather:

1. ✅ Railway build logs (full output)
2. ✅ Railway runtime logs (last 100 lines)
3. ✅ Local build test results (`npm run build`)
4. ✅ Environment variables (names only, not values)
5. ✅ Error messages (exact text)
6. ✅ Steps to reproduce

## Prevention: Best Practices

1. **Always test locally first**:
   ```bash
   npm run test:build
   npm run test:start
   ```

2. **Use pre-deployment checks**:
   ```bash
   npm run pre-deploy
   ```

3. **Monitor logs after deployment**:
   - Check Railway logs for first 5 minutes
   - Verify health endpoint responds
   - Test critical functionality

4. **Keep dependencies updated**:
   ```bash
   npm outdated
   npm update
   ```

5. **Use environment variable validation**:
   - App now validates env vars on startup
   - Check logs for validation errors

6. **Document all environment variables**:
   - Keep `RAILWAY_DEPLOYMENT.md` updated
   - Document optional vs required vars

## Quick Reference: Commands

```bash
# Local testing
npm run build              # Build locally
npm run test:build        # Build + validate
npm run test:start        # Test production start
npm run pre-deploy        # Full pre-deployment check

# Railway CLI
railway login             # Login to Railway
railway link              # Link to project
railway logs              # View logs
railway run <command>     # Run command in Railway env
railway status            # Check service status

# Database
railway run npm run db:push  # Run migrations
```

## Common Railway-Specific Issues

### Nixpacks Build Issues

Railway uses Nixpacks by default. If build fails:

1. Check `railway.json` for custom build commands
2. Verify Node.js version (Railway defaults to Node 20)
3. Check for platform-specific dependencies

### Port Configuration

Railway automatically sets `PORT`. Your app should:
- Use `process.env.PORT || "5000"`
- Listen on `0.0.0.0` (not `localhost` or `127.0.0.1`)

### Health Checks

Railway monitors `/health` endpoint (if configured in `railway.json`):
- Returns 200 OK = healthy
- Returns non-200 = unhealthy (may restart)

### Restart Policies

Configured in `railway.json`:
- `ON_FAILURE`: Restart if app crashes
- `NEVER`: Don't auto-restart
- `ALWAYS`: Always restart on failure

## Next Steps After Fixing Issues

1. ✅ Document the issue and solution
2. ✅ Update this guide if it's a new common issue
3. ✅ Test deployment again
4. ✅ Monitor logs for 24 hours
5. ✅ Set up alerts if available

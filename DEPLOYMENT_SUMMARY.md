# Deployment Summary

This document provides an overview of the deployment strategy for Taproom Tracker.

## Current Status

- **Current Hosting:** Replit (development platform)
- **Target Hosting:** Railway (production-ready PaaS)
- **PMB Integration:** Local network only (needs remote access solution)

## Deployment Phases

### Phase 1: Railway Migration ✅ (Do This First)

**Goal:** Get the app running on Railway before adding PMB remote access.

**Why First?**
- Lower risk: Test app deployment separately from PMB connection
- Easier debugging: Isolate Railway issues from PMB issues
- Faster iteration: Railway deploys are quick
- Better monitoring: See what's happening before adding complexity

**Steps:**
1. Follow `RAILWAY_DEPLOYMENT.md` guide
2. Deploy app to Railway
3. Set up PostgreSQL database
4. Configure environment variables
5. Run database migrations
6. Test all app features
7. Verify stability for 24-48 hours

**Files Created:**
- `RAILWAY_DEPLOYMENT.md` - Complete deployment guide
- `RAILWAY_QUICK_START.md` - Quick checklist
- `railway.json` - Railway configuration
- `.railwayignore` - Files to exclude from deployment

### Phase 2: PMB Bridge Service ⏭️ (After Railway is Stable)

**Goal:** Enable secure remote access to Pour My Beer server.

**Approach:**
- Lightweight Node.js bridge service on PMB server
- Exposes secure HTTPS endpoint with API key authentication
- Railway app connects to bridge service over internet
- Bridge service connects to PMB locally (127.0.0.1)

**Benefits:**
- Maximum security (HTTPS + API key)
- Zero risk to PMB (read-only, rate limited)
- Low bandwidth (~1.8 KB/minute)
- Easy to deploy and maintain

**See:** `secure_remote_pmb_access_8e4aea82.plan.md` for full details

## Key Files

### Railway Deployment
- `RAILWAY_DEPLOYMENT.md` - Complete step-by-step guide
- `RAILWAY_QUICK_START.md` - Quick reference checklist
- `railway.json` - Railway build configuration
- `.railwayignore` - Files excluded from deployment

### PMB Remote Access (Future)
- `.cursor/plans/secure_remote_pmb_access_8e4aea82.plan.md` - Full implementation plan

## Environment Variables

### Required for Railway
```bash
NODE_ENV=production
SESSION_SECRET=<generate-strong-secret>
DATABASE_URL=<automatically-set-by-railway>
PORT=5000  # Optional, Railway sets this automatically
```

### Optional (for integrations)
```bash
GOTAB_API_KEY=...
GOTAB_API_SECRET=...
GOTAB_LOCATION_UUID=...
UNTAPPD_EMAIL=...
UNTAPPD_API_TOKEN=...
UNTAPPD_LOCATION_ID=...
BARCODESPIDER_API_TOKEN=...
```

## Quick Start

1. **Railway Migration:**
   ```bash
   # Follow RAILWAY_QUICK_START.md checklist
   # Or see RAILWAY_DEPLOYMENT.md for detailed steps
   ```

2. **After Railway is Stable:**
   - Proceed with PMB Bridge Service setup
   - See plan document for details

## Support

- Railway Docs: https://docs.railway.app
- Railway Discord: https://discord.gg/railway
- Railway Status: https://status.railway.app

## Next Steps

1. ✅ Review Railway deployment guide
2. ✅ Set up Railway project
3. ✅ Deploy and test
4. ⏭️ Once stable, proceed with PMB Bridge Service

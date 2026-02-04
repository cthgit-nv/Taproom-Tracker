# Railway Deployment Investigation Status

**Date:** 2026-02-04
**Branch:** `claude/fix-railway-deployment-apfwy`

---

## Summary

Railway deployment crashes being investigated. **One fix applied.**

---

## Fix Applied

### Health Check Timeout (FIXED)
- **Problem:** `healthcheckTimeout` was set to 100ms (0.1 seconds)
- **Impact:** App marked as unhealthy before database connection established → crash loop
- **Fix:** Changed to 30000ms (30 seconds) in `railway.json`

---

## What We Verified

### Build System: WORKING
- `npm run build` succeeds
- `npm run pre-deploy` passes
- Client builds to `dist/public/assets/`
- Server builds to `dist/index.cjs` (1.1MB)

### Configuration Files: CORRECT
- `railway.json` - Uses NIXPACKS builder, start command `npm start`
- `nixpacks.toml` - Node 20.x, `npm ci`, `npm run build`
- `.nvmrc` - Node 20.19.0

### Database: CONFIGURED
- PostgreSQL provisioned on Railway
- DATABASE_URL set in service variables:
  ```
  postgresql://postgres:pCONiccTJyWcpCCLkNxXLXjCeCXRPYOO@postgres.railway.internal:5432/railway
  ```
- Internal URL being used (correct for Railway-to-Railway)

---

## Still Unknown / Needs Verification

### 1. SESSION_SECRET
- **Status:** NOT CONFIRMED
- Required for production (`server/routes.ts:28-30`)
- App will crash without it
- User needs to check if this is set in Railway Variables tab

### 2. Actual Error Message
- **Status:** NOT PROVIDED
- User was about to upload deployment logs
- This will confirm the exact failure reason

---

## Most Likely Cause (85% confidence)

Missing `SESSION_SECRET` environment variable. The code requires this in production:

```typescript
// server/routes.ts:28-30
if (process.env.NODE_ENV === "production" && !sessionSecret) {
  throw new Error("SESSION_SECRET environment variable is required in production");
}
```

---

## Required Environment Variables for Railway

### Must Have:
| Variable | Status | Notes |
|----------|--------|-------|
| `DATABASE_URL` | Set | Auto-set by Railway PostgreSQL |
| `SESSION_SECRET` | UNKNOWN | Must be set manually - generate with `openssl rand -base64 32` |

### Recommended:
| Variable | Status | Notes |
|----------|--------|-------|
| `NODE_ENV` | Unknown | Should be `production` |
| `PORT` | Unknown | Railway sets this automatically, but can be explicit (5000) |

### Optional (for integrations):
- `GOTAB_API_KEY`, `GOTAB_API_SECRET`, `GOTAB_LOCATION_UUID`
- `UNTAPPD_EMAIL`, `UNTAPPD_API_TOKEN`, `UNTAPPD_LOCATION_ID`
- `BARCODESPIDER_API_TOKEN`

---

## Next Steps

1. **Get deployment logs** from user to confirm exact error
2. **Verify SESSION_SECRET** is set in Railway
3. **If missing:** User adds SESSION_SECRET, redeploys
4. **If set:** Analyze logs for other issues

---

## Files Reviewed

- `/server/index.ts` - Entry point, env validation
- `/server/routes.ts` - Session setup, requires SESSION_SECRET
- `/server/db.ts` - Database connection, requires DATABASE_URL
- `/server/static.ts` - Static file serving
- `/server/storage.ts` - Database operations
- `/railway.json` - Railway deployment config
- `/nixpacks.toml` - Build phases config
- `/package.json` - Scripts and dependencies
- `/scripts/pre-deploy-check.js` - Validation script

---

## To Resume

Ask user for:
1. Deployment logs (screenshot or paste)
2. Confirmation of SESSION_SECRET being set

Then diagnose based on actual error message.

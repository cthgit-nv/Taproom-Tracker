# Fixing Railway Crash - Missing DATABASE_URL

## Problem
The application is crashing because `DATABASE_URL` is not set for the web service.

## Solution

### Option 1: Link Postgres Service to Web Service (Recommended)

In Railway Dashboard:

1. Go to your **Taproom-Tracker** web service
2. Go to **Settings** → **Variables**
3. Click **"New Variable"** or **"Reference Variable"**
4. Select **"Reference from another service"**
5. Choose **Postgres** service
6. Select **DATABASE_URL** variable
7. Save

This will automatically share the `DATABASE_URL` from Postgres to your web service.

### Option 2: Manual DATABASE_URL

If reference doesn't work, manually add:

1. Go to **Postgres** service → **Variables**
2. Copy the `DATABASE_URL` value
3. Go to **Taproom-Tracker** web service → **Variables**
4. Add new variable:
   - Name: `DATABASE_URL`
   - Value: (paste the value from Postgres)
5. Save

### Option 3: Use Railway CLI

```bash
# Get DATABASE_URL from Postgres service
railway variables --service Postgres | grep DATABASE_URL

# Set it for web service (replace with actual value)
railway variables set DATABASE_URL="postgresql://..." --service Taproom-Tracker
```

## After Setting DATABASE_URL

1. **Redeploy** the web service (or it will auto-restart)
2. **Check logs** to verify it starts:
   ```bash
   railway logs --service Taproom-Tracker --follow
   ```
3. **Verify health endpoint** works:
   - Visit: `https://your-app.up.railway.app/health`
   - Should return: `{"status":"ok",...}`

## Verify Environment Variables

After fixing, verify all required variables are set:

```bash
railway variables --service Taproom-Tracker
```

Should show:
- ✅ `DATABASE_URL` (from Postgres)
- ✅ `SESSION_SECRET` (already set)
- ✅ `NODE_ENV=production` (auto-set by Railway)

## Next Steps

1. ✅ Set `DATABASE_URL`
2. ✅ Verify app starts
3. ✅ Run database migrations: `railway run npm run db:push`
4. ✅ Test application

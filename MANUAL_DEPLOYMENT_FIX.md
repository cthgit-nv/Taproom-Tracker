# Manual Railway Deployment Fix

## Problem
Webhook not working after disconnecting/reconnecting. Railway CLI is only linked to Postgres service.

## Root Cause
The web application service may not exist, or it exists but isn't properly connected to GitHub.

## Solution: Manual Deployment to Identify/Create Service

### Option 1: Deploy via Railway CLI (Recommended)

This will either:
- Deploy to existing web service, OR
- Create a new service if none exists

```bash
# Make sure you're in the project root
cd /Users/coryhunt/Documents/AI_Development/Taproom-Tracker

# Deploy manually (this will prompt for service selection if multiple exist)
railway up
```

This will:
1. Upload your code to Railway
2. Build and deploy it
3. Show you which service it deployed to
4. If no web service exists, Railway may create one

### Option 2: Create Service via Railway Dashboard

1. Go to: https://railway.app/dashboard
2. Open "Taproom Tracker" project
3. Click **"+ New"**
4. Select **"GitHub Repo"**
5. Choose: `cthgit-nv/Taproom-Tracker`
6. Railway will:
   - Create a new service
   - Connect to GitHub
   - Create webhook automatically
   - Set up auto-deploy

### Option 3: Check Existing Services

1. Go to Railway Dashboard
2. Open "Taproom Tracker" project
3. Look at the services list
4. You should see:
   - **Postgres** (database) ✅
   - **Web Service** (your app) - Check if this exists

If web service exists but webhook doesn't work:
- Select the WEB SERVICE (not Postgres)
- Go to Settings → Source
- Disconnect and reconnect the repository
- This will recreate the webhook

## After Manual Deployment

Once deployed, verify:

1. **Service exists:**
   ```bash
   railway status
   # Should show your web service, not just Postgres
   ```

2. **Link to web service:**
   ```bash
   # If multiple services, Railway CLI will prompt you
   railway link
   # Select the web application service (not Postgres)
   ```

3. **Set environment variables:**
   ```bash
   # For the web service (not Postgres)
   railway variables
   # Add: SESSION_SECRET (generate with: openssl rand -base64 32)
   # DATABASE_URL should be auto-set from Postgres service
   ```

4. **Test webhook:**
   ```bash
   git commit --allow-empty -m "Test webhook after manual deploy"
   git push origin main
   # Check Railway Dashboard → Deployments for new deployment
   ```

## Verify Webhook is Working

1. **GitHub:**
   - Go to: https://github.com/cthgit-nv/Taproom-Tracker/settings/hooks
   - Should see Railway webhook
   - Check "Recent Deliveries" for 200 responses

2. **Railway:**
   - Dashboard → Your Web Service → Deployments
   - Should see deployments triggered by GitHub pushes
   - Source should show "GitHub"

## If Webhook Still Doesn't Work

1. **Check Railway GitHub App:**
   - Go to: https://github.com/settings/applications
   - Installed GitHub Apps → Railway
   - Ensure it has access to your repository
   - If not, grant access or reinstall

2. **Verify repository visibility:**
   - If private, Railway must have access
   - Check repository settings → Collaborators/Teams

3. **Manual webhook creation (last resort):**
   - Get webhook URL from Railway (Settings → Source)
   - Manually add in GitHub (Settings → Webhooks)
   - Content type: application/json
   - Events: Just the push event

## Next Steps After Webhook Works

1. ✅ Set environment variables (SESSION_SECRET, etc.)
2. ✅ Run database migrations: `railway run npm run db:push`
3. ✅ Test application at Railway URL
4. ✅ Monitor logs: `railway logs`

# Railway Webhook Troubleshooting Guide

## Current Status

- ✅ Railway CLI installed and linked
- ✅ Project: Taproom Tracker
- ✅ Repository: https://github.com/cthgit-nv/Taproom-Tracker.git
- ⚠️  Currently linked to Postgres service (need to check web app service)

## Step 1: Verify Web Application Service Exists

1. Go to Railway Dashboard: https://railway.app/dashboard
2. Select "Taproom Tracker" project
3. Check if you see:
   - **Postgres** service (database) ✅
   - **Web Application** service (your app) - Check if this exists

### If Web Application Service Doesn't Exist:

1. Click **"+ New"** in your Railway project
2. Select **"GitHub Repo"**
3. Choose: `cthgit-nv/Taproom-Tracker`
4. Railway will create a new service and automatically:
   - Connect to GitHub
   - Create webhook
   - Set up auto-deploy

## Step 2: Verify GitHub Connection in Railway

1. In Railway Dashboard → Your Project
2. Select the **Web Application** service (not Postgres)
3. Go to **Settings** → **Source**
4. Verify:
   - ✅ Repository: `cthgit-nv/Taproom-Tracker`
   - ✅ Branch: `main`
   - ✅ Auto Deploy: **Enabled**

## Step 3: Check Webhook in GitHub

1. Go to: https://github.com/cthgit-nv/Taproom-Tracker/settings/hooks
2. You should see a webhook with:
   - **URL**: Contains `railway.app`
   - **Status**: Active (green checkmark)
   - **Recent Deliveries**: Shows successful requests

### If No Webhook Exists:

The webhook should be created automatically when you connect the repository in Railway. If it's missing:

1. **Reconnect Repository in Railway:**
   - Railway Dashboard → Service → Settings → Source
   - Click "Disconnect"
   - Click "Connect GitHub Repo"
   - Select your repository again
   - Railway will recreate the webhook

2. **Check Railway GitHub App Permissions:**
   - Go to: https://github.com/settings/applications
   - Click "Installed GitHub Apps"
   - Find "Railway"
   - Ensure it has access to `cthgit-nv/Taproom-Tracker`

## Step 4: Test Webhook Connection

### Test via Railway CLI:

```bash
# Make a test commit (empty commit to test webhook)
git commit --allow-empty -m "Test Railway webhook connection"
git push origin main
```

### Then check:

1. **Railway Dashboard:**
   - Go to Deployments tab
   - You should see a new deployment triggered automatically
   - Watch the build logs

2. **GitHub Webhook:**
   - Go to: https://github.com/cthgit-nv/Taproom-Tracker/settings/hooks
   - Click on the Railway webhook
   - Check "Recent Deliveries"
   - Should show successful 200 responses

## Step 5: Verify Auto-Deploy is Working

After pushing, within 1-2 minutes:

1. Railway should automatically:
   - Detect the push
   - Start a new deployment
   - Build the application
   - Deploy it

2. Check Railway Dashboard → Deployments:
   - Latest deployment should show:
     - Source: "GitHub"
     - Status: Building/Deploying
     - Build logs visible

## Common Issues & Solutions

### Issue: Webhook exists but deployments don't trigger

**Solution:**
1. Check webhook recent deliveries for errors
2. Verify branch name matches (main vs master)
3. Check Railway service settings → Source → Branch

### Issue: "Repository not found" error

**Solution:**
1. Verify repository is public OR Railway has access
2. Check Railway GitHub App permissions
3. Reconnect repository in Railway

### Issue: Webhook shows 404 or 401 errors

**Solution:**
1. Disconnect and reconnect repository in Railway
2. This will recreate the webhook with correct credentials

### Issue: Auto-deploy disabled

**Solution:**
1. Railway Dashboard → Service → Settings → Source
2. Enable "Auto Deploy"
3. Save settings

## Quick Verification Commands

```bash
# Check current git status
git status

# Check remote repository
git remote -v

# Check current branch
git branch --show-current

# Test webhook (empty commit)
git commit --allow-empty -m "Test webhook"
git push origin main

# Check Railway status
railway status

# View Railway logs
railway logs
```

## Next Steps After Webhook is Working

1. ✅ Verify webhook triggers deployments
2. ✅ Set environment variables in Railway (SESSION_SECRET, etc.)
3. ✅ Monitor first deployment
4. ✅ Run database migrations: `railway run npm run db:push`
5. ✅ Test application at Railway URL

## Need More Help?

- Railway Docs: https://docs.railway.app/guides/github-autodeploys
- Railway Discord: https://discord.gg/railway
- Check `DEPLOYMENT_DEBUG.md` for deployment issues

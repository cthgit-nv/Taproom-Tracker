# GitHub & Railway Integration Verification Guide

This guide helps you verify and troubleshoot the connection between your GitHub repository and Railway.

## Quick Verification Checklist

- [ ] GitHub repository exists and is accessible
- [ ] Railway project is connected to GitHub repository
- [ ] Railway has proper permissions to access the repository
- [ ] Auto-deploy is enabled for the correct branch
- [ ] Webhook is configured in GitHub
- [ ] Railway can trigger deployments on push

## Step-by-Step Verification

### 1. Verify GitHub Repository Access

1. Go to your GitHub repository: `https://github.com/YOUR_USERNAME/YOUR_REPO`
2. Verify the repository is accessible
3. Check that the main branch exists (usually `main` or `master`)
4. Ensure you have push access to the repository

### 2. Verify Railway Project Connection

1. Go to [Railway Dashboard](https://railway.app/dashboard)
2. Select your project
3. Go to **Settings** → **Source**
4. Verify:
   - Repository is connected
   - Branch is set correctly (usually `main` or `master`)
   - Auto-deploy is enabled

### 3. Check Railway GitHub App Permissions

1. Go to GitHub: **Settings** → **Applications** → **Installed GitHub Apps**
2. Find "Railway" in the list
3. Click on it to view permissions
4. Verify it has access to your repository
5. If not, you may need to:
   - Reconnect the repository in Railway
   - Or grant Railway access to the repository

### 4. Verify Webhook Configuration

1. Go to your GitHub repository
2. Navigate to **Settings** → **Webhooks**
3. Look for a webhook from Railway (should have `railway.app` in the URL)
4. Verify:
   - Webhook is active
   - Events include "push" events
   - Recent deliveries show successful requests

### 5. Test Auto-Deploy

1. Make a small change to your repository (e.g., update README)
2. Commit and push to the main branch:
   ```bash
   git add .
   git commit -m "Test deployment"
   git push origin main
   ```
3. Go to Railway dashboard
4. Check if a new deployment is triggered automatically
5. Monitor the deployment logs

## Troubleshooting

### Issue: Railway Can't Access Repository

**Symptoms:**
- "Repository not found" error
- "Access denied" error
- Deployment doesn't trigger

**Solutions:**

1. **Check Repository Visibility:**
   - If private, ensure Railway GitHub App has access
   - Go to GitHub → Settings → Applications → Railway
   - Grant access to the repository

2. **Reconnect Repository:**
   - Railway Dashboard → Project → Settings → Source
   - Disconnect and reconnect the repository
   - Grant necessary permissions

3. **Check GitHub App Installation:**
   - Ensure Railway GitHub App is installed
   - Install from: https://railway.app/account

### Issue: Auto-Deploy Not Working

**Symptoms:**
- Pushing to GitHub doesn't trigger deployment
- Manual deploy required

**Solutions:**

1. **Verify Auto-Deploy Settings:**
   - Railway Dashboard → Project → Settings → Source
   - Ensure "Auto Deploy" is enabled
   - Verify branch matches your default branch

2. **Check Webhook:**
   - GitHub → Repository → Settings → Webhooks
   - Verify Railway webhook exists and is active
   - Check recent deliveries for errors

3. **Test Webhook:**
   - In GitHub webhook settings, click "Recent Deliveries"
   - Look for failed requests
   - Check response codes (should be 200)

4. **Recreate Webhook:**
   - Disconnect repository in Railway
   - Reconnect repository
   - Railway will recreate the webhook

### Issue: Wrong Branch Deploying

**Symptoms:**
- Deployments trigger from wrong branch
- Changes from main branch not deploying

**Solutions:**

1. **Check Branch Settings:**
   - Railway Dashboard → Project → Settings → Source
   - Verify "Branch" matches your default branch
   - Update if needed

2. **Verify Default Branch:**
   - GitHub → Repository → Settings → Branches
   - Check default branch name
   - Update Railway settings to match

### Issue: GitHub Actions Not Running

**Note:** If you're using GitHub Actions (`.github/workflows/railway-deploy.yml`), you need to set up secrets.

**Required Secrets:**
- `RAILWAY_TOKEN`: Railway project token
- `RAILWAY_SERVICE_ID`: Railway service ID (optional, can be inferred)

**Setting Up Secrets:**

1. **Get Railway Project Token:**
   - Railway Dashboard → Project → Settings → Tokens
   - Create new token
   - Copy the token

2. **Add to GitHub Secrets:**
   - GitHub → Repository → Settings → Secrets and variables → Actions
   - Add new secret: `RAILWAY_TOKEN`
   - Paste the token value

3. **Get Service ID (if needed):**
   - Railway Dashboard → Service → Settings
   - Service ID is in the URL or settings

## Using Railway CLI for Verification

### Install Railway CLI

```bash
npm install -g @railway/cli
```

### Login and Link

```bash
# Login to Railway
railway login

# Link to your project
railway link
```

### Check Project Status

```bash
# View project info
railway status

# View deployments
railway logs
```

### Manual Deployment (if auto-deploy fails)

```bash
# Deploy current code
railway up
```

## Verification Commands

### Check Repository Connection

```bash
# In Railway Dashboard:
# Project → Settings → Source
# Should show: "Connected to GitHub: YOUR_REPO"
```

### Test Deployment Trigger

```bash
# Make a test commit
echo "# Test" >> README.md
git add README.md
git commit -m "Test deployment trigger"
git push origin main

# Then check Railway dashboard for new deployment
```

### Verify Webhook

```bash
# In GitHub:
# Repository → Settings → Webhooks
# Should see Railway webhook with recent successful deliveries
```

## Best Practices

1. **Always test locally first:**
   ```bash
   npm run pre-deploy
   ```

2. **Monitor first deployment:**
   - Watch Railway logs in real-time
   - Verify build completes
   - Check application starts correctly

3. **Use branch protection:**
   - Protect main branch in GitHub
   - Require pull request reviews
   - Railway can still deploy from protected branches

4. **Set up notifications:**
   - Railway can send email notifications
   - Configure in Railway Dashboard → Project → Settings → Notifications

5. **Use Railway CLI for debugging:**
   ```bash
   railway logs --follow
   ```

## Common Configuration Issues

### Issue: Build Command Not Running

**Check:**
- `railway.json` has correct `buildCommand`
- `package.json` has `build` script
- Build command doesn't require interactive input

### Issue: Start Command Failing

**Check:**
- `railway.json` has correct `startCommand`
- `package.json` has `start` script
- Environment variables are set correctly
- Port is configured correctly (Railway sets `PORT` automatically)

### Issue: Environment Variables Not Available

**Check:**
- Variables are set in Railway Dashboard → Variables
- Variable names match exactly (case-sensitive)
- Redeploy after adding new variables

## Next Steps

After verifying GitHub-Railway integration:

1. ✅ Test a deployment
2. ✅ Verify application works
3. ✅ Set up monitoring
4. ✅ Configure custom domain (optional)
5. ✅ Set up database migrations

## Getting Help

- **Railway Support**: https://railway.app/support
- **Railway Discord**: https://discord.gg/railway
- **GitHub Issues**: Check Railway's GitHub for known issues

## Quick Reference

```bash
# Verify connection
railway status

# View logs
railway logs

# Manual deploy
railway up

# Run commands
railway run <command>

# Check environment
railway run env
```

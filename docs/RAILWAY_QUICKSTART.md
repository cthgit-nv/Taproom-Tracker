# Quick Railway Deployment Guide

This is a streamlined guide to get your Taproom Tracker live on Railway in ~15 minutes.

## Prerequisites
- Railway account (free to start): https://railway.app
- GitHub repo with your Taproom Tracker code
- API credentials for integrations (Untappd, GoTab, PMB, Barcode Spider)

---

## Step 1: Push Latest Changes to GitHub

First, make sure all your recent changes are pushed:

```bash
cd /path/to/Taproom-Tracker
git status
git add .
git commit -m "Add deployment configuration"
git push origin main  # or whatever your main branch is
```

---

## Step 2: Create Railway Project

1. **Go to Railway**: https://railway.app/dashboard
2. **Click "New Project"**
3. **Select "Deploy from GitHub repo"**
4. **Authorize GitHub** (if first time)
5. **Select your repository**: `Taproom-Tracker`
6. Railway will detect it's a Node.js app and start building

---

## Step 3: Add PostgreSQL Database

1. **In your Railway project dashboard**, click **"+ New"**
2. Select **"Database"** → **"Add PostgreSQL"**
3. Railway will automatically:
   - Create a PostgreSQL database
   - Set the `DATABASE_URL` environment variable
   - Link it to your app

---

## Step 4: Configure Environment Variables

1. **Click on your web service** (the one with your app, not the database)
2. **Go to "Variables" tab**
3. **Click "Raw Editor"** and paste this (update with your real values):

```env
NODE_ENV=production
PORT=3000

# Session Secret - generate with: openssl rand -base64 32
SESSION_SECRET=REPLACE_WITH_RANDOM_32_CHAR_STRING

# Untappd (get from: https://business.untappd.com/api)
UNTAPPD_CLIENT_ID=your-untappd-client-id
UNTAPPD_CLIENT_SECRET=your-untappd-client-secret
UNTAPPD_LOCATION_ID=your-location-id

# GoTab (get from GoTab dashboard)
GOTAB_API_KEY=your-gotab-api-key
GOTAB_API_URL=https://api.gotab.io/v1
GOTAB_LOCATION_ID=your-gotab-location-id

# PourMyBeer (get from PMB dashboard)
PMB_API_KEY=your-pourmybeer-api-key
PMB_API_URL=https://api.pourmybeer.com/v1
PMB_LOCATION_ID=your-pmb-location-id

# Barcode Spider (get from: https://www.barcodespider.com)
BARCODE_SPIDER_API_KEY=your-barcode-spider-api-key
```

**Important Notes:**
- `DATABASE_URL` is automatically set by Railway when you add PostgreSQL - don't add it manually
- Generate a secure `SESSION_SECRET` with: `openssl rand -base64 32` in your terminal
- Add your real API keys for the services you'll use

4. **Click "Deploy" or save** - Railway will redeploy with new variables

---

## Step 5: Wait for Build & Deploy

Railway will:
1. ✅ Install dependencies (`npm install`)
2. ✅ Build your app (`npm run build`)
3. ✅ Start the server (`node dist/index.cjs`)

**Watch the logs** in the "Deployments" tab to see progress.

---

## Step 6: Run Database Migrations

Once deployed, you need to set up your database schema:

### Option A: Using Railway CLI (Recommended)

```bash
# Install Railway CLI
npm install -g @railway/cli

# Login to Railway
railway login

# Link to your project
railway link

# Run migration
railway run npm run db:push

# Verify it worked
railway run npm run db:push
```

### Option B: Using Railway Dashboard

1. **In Railway dashboard**, click your web service
2. **Go to "Settings" tab**
3. Scroll to **"Deploy"** section
4. In **"Custom Start Command"**, temporarily change to:
   ```
   npm run db:push && node dist/index.cjs
   ```
5. **Redeploy** (Railway will run migration on startup)
6. After successful deploy, **change back to**: `node dist/index.cjs`

---

## Step 7: Get Your Live URL

1. **Click on your web service** in Railway
2. **Go to "Settings" → "Networking"**
3. **Click "Generate Domain"** - you'll get a free `yourapp.up.railway.app` URL
4. **Open the URL** in your browser

You should see your Taproom Tracker login screen! 🎉

---

## Step 8: Create Your First Admin Account

You need to create an admin user in the database:

### Using Railway CLI:

```bash
# Open PostgreSQL shell
railway run psql $DATABASE_URL

# Create admin user (replace with your desired PIN)
INSERT INTO team_members (name, pin, role, created_at, updated_at)
VALUES ('Admin', '1234', 'owner', NOW(), NOW());

# Exit
\q
```

### Using Railway Dashboard:

1. **Click on your PostgreSQL database** in Railway
2. **Go to "Data" tab**
3. **Click "Query"**
4. Run this SQL:
   ```sql
   INSERT INTO team_members (name, pin, role, created_at, updated_at)
   VALUES ('Admin', '1234', 'owner', NOW(), NOW());
   ```

**Security Note:** Change `1234` to a different 4-digit PIN!

---

## Step 9: Login & Test

1. **Go to your Railway URL**
2. **Enter your PIN** (e.g., `1234`)
3. You should see the dashboard!

**Test the basics:**
- ✅ Can you see the dashboard?
- ✅ Can you navigate to Products?
- ✅ Can you navigate to Inventory?
- ✅ Try creating a test product

---

## Step 10: Add Custom Domain (Optional)

If you want to use your own domain like `inventory.yourtaproom.com`:

1. **In Railway**, click your web service → "Settings" → "Networking"
2. **Click "Custom Domain"**
3. **Enter your domain**: `inventory.yourtaproom.com`
4. Railway will show you DNS records to add
5. **Go to your domain registrar** (GoDaddy, Namecheap, Cloudflare, etc.)
6. **Add CNAME record**:
   - Name: `inventory` (or whatever subdomain you want)
   - Value: `yourapp.up.railway.app`
7. **Wait 5-30 minutes** for DNS propagation
8. **SSL is automatic** - Railway provisions Let's Encrypt certificate

---

## Troubleshooting

### Build Fails

**Error:** `Cannot find module` or build errors

**Fix:**
```bash
# Locally, ensure your code works:
npm install
npm run build
npm run start

# If that works, push to GitHub and Railway will rebuild
git add .
git commit -m "Fix build"
git push
```

### Database Connection Error

**Error:** `Connection refused` or `ECONNREFUSED`

**Fix:**
1. Make sure PostgreSQL is added to your project
2. Check that `DATABASE_URL` is set automatically (don't manually set it)
3. Restart the deployment

### Migration Fails

**Error:** `relation "products" already exists`

**Fix:**
```bash
# Drop all tables and recreate (WARNING: deletes data!)
railway run psql $DATABASE_URL

DROP SCHEMA public CASCADE;
CREATE SCHEMA public;
\q

# Then re-run migration
railway run npm run db:push
```

### Can't Login

**Fix:**
1. Make sure you created an admin user (Step 8)
2. Check the PIN is correct
3. View logs in Railway to see authentication errors

### API Integration Not Working

**Fix:**
1. Go to Settings → Integrations in your app
2. Test each integration
3. Check environment variables are correct in Railway
4. View logs to see API errors

---

## Monitoring Your App

### View Logs

In Railway dashboard:
1. Click your web service
2. Go to "Deployments" tab
3. Click latest deployment
4. See real-time logs

### Check Health

Visit: `https://yourapp.up.railway.app/health`

Should return:
```json
{
  "status": "ok",
  "timestamp": "2024-01-17T...",
  "uptime": 12345
}
```

---

## Cost Estimate

Railway pricing (as of 2024):
- **Hobby Plan**: $5/month
  - 512MB RAM
  - 1GB disk
  - PostgreSQL included
  - Auto-deploy from GitHub
  - Custom domains
  - SSL included

**Your app should run comfortably on the $5/month plan.**

---

## Auto-Deploy Setup

Railway already auto-deploys when you push to GitHub:

1. Make changes to your code
2. Commit and push to GitHub: `git push origin main`
3. Railway automatically rebuilds and deploys
4. Watch progress in Railway dashboard

---

## Backup Your Database

Railway includes daily backups, but you can manually backup:

```bash
# Download backup
railway run pg_dump $DATABASE_URL > backup-$(date +%Y%m%d).sql

# Restore from backup (if needed)
railway run psql $DATABASE_URL < backup-20240117.sql
```

---

## Next Steps After Deployment

1. **Configure your integrations** in Settings → Integrations
2. **Import your products** from Untappd or manually
3. **Set up zones** for your taproom layout
4. **Create team members** with appropriate roles
5. **Train your staff** on using the system
6. **Set up pricing defaults** in Settings
7. **Do a test inventory count** to verify workflow

---

## Getting Help

If you run into issues:

1. **Check Railway logs** for error messages
2. **Test locally first**: `npm run dev`
3. **Verify environment variables** are set correctly
4. **Check the health endpoint**: `/health`
5. **Review the main deployment guide**: `docs/DEPLOYMENT_GUIDE.md`

---

## Security Checklist

Before going live with real data:

- [ ] Changed default admin PIN from `1234`
- [ ] `SESSION_SECRET` is a random 32+ character string
- [ ] All API keys are environment variables (not in code)
- [ ] HTTPS is enabled (automatic with Railway)
- [ ] Only necessary team members have access
- [ ] Tested all integrations work correctly
- [ ] Backup strategy in place

---

## Summary

You now have:
- ✅ Live Taproom Tracker on Railway
- ✅ PostgreSQL database
- ✅ Auto-deploy from GitHub
- ✅ HTTPS with custom domain (optional)
- ✅ Health monitoring endpoint

**Your app is live at:** `https://yourapp.up.railway.app`

Enjoy managing your taproom inventory! 🍺

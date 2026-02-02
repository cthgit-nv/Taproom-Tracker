# Railway Deployment Guide

This guide will help you deploy Taproom Tracker to Railway, migrating from Replit to a production-ready hosting platform.

## Prerequisites

- Railway account (you already have one)
- Git repository with your code (GitHub, GitLab, or Bitbucket)
- Access to your Railway dashboard

## Step 1: Connect Repository to Railway

1. Go to [Railway Dashboard](https://railway.app/dashboard)
2. Click **"New Project"**
3. Select **"Deploy from GitHub repo"** (or your Git provider)
4. Choose your Taproom Tracker repository
5. Railway will automatically detect it's a Node.js project

## Step 2: Add PostgreSQL Database

1. In your Railway project, click **"+ New"**
2. Select **"Database"** → **"Add PostgreSQL"**
3. Railway will automatically create a PostgreSQL database
4. The `DATABASE_URL` environment variable will be automatically set

## Step 3: Configure Environment Variables

Go to your service settings → **Variables** tab and add:

### Required Variables

```bash
NODE_ENV=production
PORT=5000
SESSION_SECRET=<generate-a-strong-random-string>
```

**Generate SESSION_SECRET:**
```bash
# On Mac/Linux:
openssl rand -base64 32

# Or use an online generator:
# https://randomkeygen.com/
```

### Optional Variables (for integrations)

These are only needed if you're using these integrations:

```bash
# GoTab Integration
GOTAB_API_KEY=your_key
GOTAB_API_SECRET=your_secret
GOTAB_LOCATION_UUID=your_uuid

# Untappd Integration
UNTAPPD_EMAIL=your_email
UNTAPPD_API_TOKEN=your_token
UNTAPPD_LOCATION_ID=your_location_id

# Barcode Spider Integration
BARCODESPIDER_API_TOKEN=your_token
```

**Note:** `DATABASE_URL` is automatically provided by Railway - don't set it manually!

## Step 4: Configure Build Settings

Railway should auto-detect these, but verify in **Settings** → **Build**:

- **Build Command:** `npm run build`
- **Start Command:** `npm start`
- **Root Directory:** `/` (root)

## Step 5: Deploy

1. Railway will automatically deploy when you push to your main branch
2. Or click **"Deploy"** in the Railway dashboard
3. Watch the build logs in real-time
4. Wait for deployment to complete (usually 2-3 minutes)

## Step 6: Run Database Migrations

After first deployment, you need to set up your database schema:

1. Go to your service in Railway
2. Click **"Deployments"** tab
3. Click on the latest deployment
4. Click **"View Logs"**
5. In the Railway dashboard, go to your service → **Settings** → **Connect**
6. Use the Railway CLI or run migrations via one-off command:

**Option A: Using Railway CLI**
```bash
# Install Railway CLI
npm i -g @railway/cli

# Login
railway login

# Link to your project
railway link

# Run migrations
railway run npm run db:push
```

**Option B: Using Railway Dashboard**
1. Go to your service → **Settings** → **Deploy**
2. Add a one-off command: `npm run db:push`
3. Run it once to set up the database

## Step 7: Verify Deployment

1. Railway provides a default domain (e.g., `your-app.up.railway.app`)
2. Visit the URL to test your app
3. Check logs in Railway dashboard for any errors
4. Test login and basic functionality

## Step 8: Set Up Custom Domain (Optional)

1. Go to your service → **Settings** → **Networking**
2. Click **"Generate Domain"** or **"Custom Domain"**
3. Add your domain and configure DNS as instructed

## Monitoring and Logs

### Viewing Logs

- **Real-time logs:** Click on your service → **"Deployments"** → **"View Logs"**
- **Streaming logs:** Logs update in real-time as your app runs
- **Search logs:** Use the search bar to filter logs

### Metrics

Railway provides:
- **CPU Usage:** Monitor resource consumption
- **Memory Usage:** Track memory usage
- **Network:** Bandwidth usage
- **Request Metrics:** Response times and error rates

### Health Checks

Railway automatically monitors your service:
- Checks if the service is responding
- Restarts if the service crashes
- Alerts you if there are issues

## Troubleshooting

### Build Fails

1. Check build logs for errors
2. Verify `package.json` has correct build script
3. Ensure all dependencies are listed in `package.json`
4. Check Node.js version (Railway uses Node 20 by default)

### Database Connection Issues

1. Verify `DATABASE_URL` is set (Railway sets this automatically)
2. Check database service is running
3. Verify database credentials in Railway dashboard

### App Crashes on Start

1. Check logs for error messages
2. Verify `SESSION_SECRET` is set
3. Ensure `PORT` environment variable is set (Railway sets this automatically)
4. Check that database migrations have run

### Environment Variables Not Working

1. Verify variables are set in Railway dashboard
2. Redeploy after adding new variables
3. Check variable names match exactly (case-sensitive)

## Cost Estimation

Railway pricing (as of 2024):
- **Free tier:** $5 credit/month
- **Hobby plan:** $5/month + usage
- **Pro plan:** $20/month + usage

For this app:
- **Estimated cost:** $5-10/month (depending on traffic)
- Database included in service cost
- Bandwidth: Minimal (PMB polling is very low)

## Next Steps

After Railway deployment is working:

1. ✅ Test all app features
2. ✅ Verify database persistence
3. ✅ Test authentication and sessions
4. ✅ Monitor logs and metrics
5. ⏭️ **Then proceed to PMB Bridge Service setup**

## Rollback Plan

If something goes wrong:

1. Go to **Deployments** tab
2. Find a previous working deployment
3. Click **"Redeploy"** to roll back
4. Or keep Replit running as backup during migration

## Support

- Railway Docs: https://docs.railway.app
- Railway Discord: https://discord.gg/railway
- Railway Status: https://status.railway.app

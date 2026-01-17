# Taproom Tracker Deployment Guide

## Overview

This guide covers deploying Taproom Tracker to production environments. The app is a full-stack Node.js application with:
- **Backend:** Express + TypeScript
- **Frontend:** React + Vite
- **Database:** PostgreSQL
- **Integrations:** Untappd, GoTab, PourMyBeer, Barcode Spider

---

## Deployment Options Comparison

| Platform | Difficulty | Cost | Pros | Cons |
|----------|-----------|------|------|------|
| **Railway** | ⭐ Easy | $5-20/mo | Auto-deploy, PostgreSQL included, custom domain | Limited free tier |
| **Fly.io** | ⭐⭐ Medium | $5-15/mo | Global edge, good pricing, Postgres included | CLI-heavy setup |
| **Render** | ⭐ Easy | $7-25/mo | Simple, PostgreSQL included, auto-deploy | Slower cold starts |
| **VPS (Self-host)** | ⭐⭐⭐ Hard | $5-10/mo | Full control, cheapest long-term | Requires server management |

**Recommendation:** Start with **Railway** for easiest deployment, then migrate to self-hosted VPS if you want more control later.

---

## Option 1: Railway Deployment (Recommended for Quick Start)

Railway is perfect for getting your app live quickly with auto-deployment from GitHub.

### Step 1: Prepare Your Repository

1. **Create a `railway.json` file** in project root:

```json
{
  "$schema": "https://railway.app/railway.schema.json",
  "build": {
    "builder": "NIXPACKS"
  },
  "deploy": {
    "startCommand": "npm run start",
    "restartPolicyType": "ON_FAILURE",
    "restartPolicyMaxRetries": 10
  }
}
```

2. **Create a `Procfile`** (optional, Railway auto-detects):

```
web: npm run start
```

3. **Add production build script** to `package.json`:

```json
{
  "scripts": {
    "start": "NODE_ENV=production node server/index.ts",
    "build": "npm run build:client",
    "build:client": "vite build"
  }
}
```

### Step 2: Deploy to Railway

1. **Sign up at Railway.app** (free to start)
   - Go to https://railway.app
   - Sign up with GitHub

2. **Create New Project**
   - Click "New Project"
   - Select "Deploy from GitHub repo"
   - Choose your `Taproom-Tracker` repository
   - Railway will auto-detect it's a Node.js app

3. **Add PostgreSQL Database**
   - In your project, click "+ New"
   - Select "Database" → "Add PostgreSQL"
   - Railway will provision a database and create `DATABASE_URL` env variable

4. **Configure Environment Variables**
   - Click on your service → "Variables" tab
   - Add these variables:

   ```env
   NODE_ENV=production
   PORT=3000

   # Database (Railway auto-provides DATABASE_URL)
   # Don't need to set DATABASE_URL manually

   # Session Secret (generate a secure random string)
   SESSION_SECRET=your-super-secret-random-string-here-min-32-chars

   # API Keys (get these from your integrations)
   UNTAPPD_CLIENT_ID=your-untappd-client-id
   UNTAPPD_CLIENT_SECRET=your-untappd-client-secret

   GOTAB_API_KEY=your-gotab-api-key
   GOTAB_API_URL=https://api.gotab.io/v1

   PMB_API_KEY=your-pourmybeer-api-key
   PMB_API_URL=https://api.pourmybeer.com/v1

   BARCODE_SPIDER_API_KEY=your-barcode-spider-key
   ```

5. **Deploy**
   - Railway will automatically build and deploy
   - Every push to your main branch will auto-deploy
   - Watch logs in real-time in the Railway dashboard

### Step 3: Run Database Migrations

Railway doesn't run migrations automatically, so you need to:

1. **Add migration command to package.json**:

```json
{
  "scripts": {
    "db:migrate": "drizzle-kit push:pg",
    "db:seed": "tsx script/seed.ts"
  }
}
```

2. **Run migrations via Railway CLI**:

```bash
# Install Railway CLI
npm i -g @railway/cli

# Login
railway login

# Link to your project
railway link

# Run migration
railway run npm run db:migrate

# Optional: seed initial data
railway run npm run db:seed
```

Or use the Railway web console:
- Go to your service → "Settings" → "Deploy"
- Add a "Deploy Command": `npm run db:migrate && npm run build`

### Step 4: Add Custom Domain

1. **In Railway Dashboard**:
   - Click your service → "Settings" → "Networking"
   - Click "Generate Domain" for a free `.railway.app` domain
   - Or click "Custom Domain" to add your own

2. **For Custom Domain** (e.g., `taproom.yourbusiness.com`):
   - Add domain in Railway
   - Railway will show DNS records to add
   - Go to your DNS provider (GoDaddy, Cloudflare, etc.)
   - Add CNAME record: `taproom` → `your-project.railway.app`
   - Wait for DNS propagation (5-30 minutes)

3. **SSL Certificate**:
   - Railway automatically provisions Let's Encrypt SSL
   - HTTPS will be enabled automatically

---

## Option 2: Fly.io Deployment (Good Performance)

Fly.io is great for apps that need global edge deployment.

### Step 1: Install Fly CLI

```bash
# Install flyctl
curl -L https://fly.io/install.sh | sh

# Login
flyctl auth login
```

### Step 2: Create fly.toml

```toml
app = "taproom-tracker"
primary_region = "sea"  # Change to your region

[build]
  [build.args]
    NODE_VERSION = "20"

[env]
  NODE_ENV = "production"
  PORT = "8080"

[http_service]
  internal_port = 8080
  force_https = true
  auto_stop_machines = true
  auto_start_machines = true
  min_machines_running = 1

[[services]]
  protocol = "tcp"
  internal_port = 8080

  [[services.ports]]
    port = 80
    handlers = ["http"]
    force_https = true

  [[services.ports]]
    port = 443
    handlers = ["tls", "http"]

  [services.concurrency]
    type = "connections"
    hard_limit = 25
    soft_limit = 20

[[vm]]
  cpu_kind = "shared"
  cpus = 1
  memory_mb = 512
```

### Step 3: Create Postgres Database

```bash
# Create Postgres cluster
flyctl postgres create --name taproom-db --region sea

# Attach to your app
flyctl postgres attach taproom-db
```

### Step 4: Set Environment Variables

```bash
flyctl secrets set SESSION_SECRET="your-secret-here"
flyctl secrets set UNTAPPD_CLIENT_ID="your-id"
flyctl secrets set UNTAPPD_CLIENT_SECRET="your-secret"
# ... add all other secrets
```

### Step 5: Deploy

```bash
# Initial deploy
flyctl launch

# Subsequent deploys
flyctl deploy

# View logs
flyctl logs
```

### Step 6: Add Custom Domain

```bash
# Add your domain
flyctl certs create taproom.yourbusiness.com

# Fly will show you DNS records to add
# Add CNAME: taproom → your-app.fly.dev
```

---

## Option 3: Self-Hosted on VPS (Full Control)

For complete control, deploy on a VPS (DigitalOcean, Linode, Hetzner, etc.)

### Prerequisites

- Ubuntu 22.04 VPS ($5-10/month)
- Domain name pointing to VPS IP
- SSH access to server

### Step 1: Initial Server Setup

```bash
# SSH into your server
ssh root@your-server-ip

# Update system
apt update && apt upgrade -y

# Install Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs

# Install PostgreSQL
apt install -y postgresql postgresql-contrib

# Install Nginx (reverse proxy)
apt install -y nginx

# Install Certbot (SSL)
apt install -y certbot python3-certbot-nginx

# Install PM2 (process manager)
npm install -g pm2
```

### Step 2: Setup PostgreSQL

```bash
# Switch to postgres user
sudo -u postgres psql

# Create database and user
CREATE DATABASE taproom_tracker;
CREATE USER taproom_user WITH ENCRYPTED PASSWORD 'your-secure-password';
GRANT ALL PRIVILEGES ON DATABASE taproom_tracker TO taproom_user;
\q
```

### Step 3: Deploy Application

```bash
# Create app directory
mkdir -p /var/www/taproom-tracker
cd /var/www/taproom-tracker

# Clone your repo
git clone https://github.com/your-username/Taproom-Tracker.git .

# Install dependencies
npm install

# Build frontend
npm run build

# Create .env file
cat > .env << EOF
NODE_ENV=production
PORT=3000
DATABASE_URL=postgresql://taproom_user:your-secure-password@localhost:5432/taproom_tracker
SESSION_SECRET=your-super-secret-random-string-min-32-chars
UNTAPPD_CLIENT_ID=your-id
UNTAPPD_CLIENT_SECRET=your-secret
# ... add all other env vars
EOF

# Run migrations
npm run db:migrate

# Start with PM2
pm2 start npm --name taproom-tracker -- start
pm2 save
pm2 startup
```

### Step 4: Configure Nginx

```bash
# Create Nginx config
cat > /etc/nginx/sites-available/taproom-tracker << 'EOF'
server {
    listen 80;
    server_name taproom.yourbusiness.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
EOF

# Enable site
ln -s /etc/nginx/sites-available/taproom-tracker /etc/nginx/sites-enabled/
nginx -t
systemctl restart nginx
```

### Step 5: Setup SSL

```bash
# Get SSL certificate
certbot --nginx -d taproom.yourbusiness.com

# Certbot will auto-configure Nginx for HTTPS
```

### Step 6: Setup Auto-Deploy (Optional)

Create a webhook endpoint that pulls latest code on push:

```bash
# Install webhook
apt install -y webhook

# Create webhook script
cat > /var/www/deploy.sh << 'EOF'
#!/bin/bash
cd /var/www/taproom-tracker
git pull origin main
npm install
npm run build
pm2 restart taproom-tracker
EOF

chmod +x /var/www/deploy.sh

# Configure webhook
cat > /etc/webhook.conf << 'EOF'
[
  {
    "id": "deploy-taproom",
    "execute-command": "/var/www/deploy.sh",
    "command-working-directory": "/var/www/taproom-tracker",
    "pass-arguments-to-command": [],
    "trigger-rule": {
      "match": {
        "type": "payload-hash-sha1",
        "secret": "your-webhook-secret",
        "parameter": {
          "source": "header",
          "name": "X-Hub-Signature"
        }
      }
    }
  }
]
EOF

# Start webhook service
webhook -hooks /etc/webhook.conf -verbose
```

Add webhook URL to GitHub repo settings: `http://your-server-ip:9000/hooks/deploy-taproom`

---

## Security Checklist

Before going live, ensure:

### 1. Environment Variables
- [ ] All API keys are in environment variables (not hardcoded)
- [ ] SESSION_SECRET is a random 32+ character string
- [ ] DATABASE_URL uses strong password

### 2. Database Security
- [ ] Database is not exposed to public internet
- [ ] Using strong database password
- [ ] Regular backups configured

### 3. Application Security
- [ ] HTTPS enabled (SSL certificate)
- [ ] CORS configured properly
- [ ] Rate limiting enabled for API endpoints
- [ ] SQL injection protection (using Drizzle ORM - already safe)
- [ ] XSS protection (React already escapes by default)

### 4. Access Control
- [ ] Admin panel requires authentication
- [ ] Staff have appropriate role-based access
- [ ] PIN authentication working correctly

### 5. Monitoring
- [ ] Error logging setup (Sentry, LogRocket, etc.)
- [ ] Uptime monitoring (UptimeRobot, Pingdom)
- [ ] Performance monitoring (New Relic, Datadog)

---

## Post-Deployment Setup

### 1. Create Initial Admin Account

```bash
# SSH into server or use Railway/Fly console
railway run npm run db:seed

# Or manually via PostgreSQL
psql $DATABASE_URL

INSERT INTO team_members (name, pin_hash, role, created_at)
VALUES ('Admin', '$2b$10$...', 'owner', NOW());
```

### 2. Configure Integrations

1. **Untappd for Business**:
   - Get API credentials from https://business.untappd.com/api
   - Add to environment variables
   - Test in Settings → Integrations

2. **GoTab**:
   - Get API key from GoTab dashboard
   - Configure webhook for sales sync
   - Test connection

3. **PourMyBeer**:
   - Get API credentials from PMB dashboard
   - Configure tap mapping
   - Test real-time keg levels

### 3. Setup Backups

**For Railway/Fly:**
```bash
# Railway auto-backups (included)
# Fly backups:
flyctl postgres backup create --app taproom-db
```

**For VPS:**
```bash
# Create backup script
cat > /root/backup.sh << 'EOF'
#!/bin/bash
DATE=$(date +%Y%m%d_%H%M%S)
pg_dump -U taproom_user taproom_tracker > /backups/taproom_$DATE.sql
find /backups -name "taproom_*.sql" -mtime +7 -delete
EOF

chmod +x /root/backup.sh

# Add to crontab (daily at 2am)
crontab -e
0 2 * * * /root/backup.sh
```

---

## CI/CD Setup (GitHub Actions)

Create `.github/workflows/deploy.yml`:

```yaml
name: Deploy to Production

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '20'

      - name: Install dependencies
        run: npm ci

      - name: Run tests
        run: npm test

      - name: Build
        run: npm run build

      - name: Deploy to Railway
        if: success()
        env:
          RAILWAY_TOKEN: ${{ secrets.RAILWAY_TOKEN }}
        run: |
          npm install -g @railway/cli
          railway up --service taproom-tracker
```

Add `RAILWAY_TOKEN` to GitHub Secrets:
1. Get token: `railway login && railway whoami --token`
2. Add to GitHub repo → Settings → Secrets → Actions

---

## Monitoring & Maintenance

### Health Check Endpoint

Add to `server/index.ts`:

```typescript
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});
```

### Log Management

**For Railway/Fly:** Built-in log viewer in dashboard

**For VPS with PM2:**
```bash
# View logs
pm2 logs taproom-tracker

# Monitor in real-time
pm2 monit

# View error logs only
pm2 logs taproom-tracker --err
```

### Performance Monitoring

Consider adding:
- **Sentry** for error tracking
- **Logtail** for log aggregation
- **UptimeRobot** for uptime monitoring (free)

---

## Troubleshooting

### Common Issues

**1. Database Connection Error**
```bash
# Check DATABASE_URL is set
railway run printenv | grep DATABASE_URL

# Test connection
psql $DATABASE_URL
```

**2. Build Fails**
```bash
# Clear cache
rm -rf node_modules package-lock.json
npm install

# Check Node version
node -v  # Should be 20.x
```

**3. Migration Issues**
```bash
# Reset database (WARNING: deletes all data)
railway run npm run db:reset

# Re-run migrations
railway run npm run db:migrate
```

**4. SSL Certificate Issues**
```bash
# For VPS: Renew certificate
certbot renew --dry-run
certbot renew
```

---

## Cost Estimates

### Railway
- **Hobby Plan**: $5/mo (512MB RAM, 1GB storage)
- **Pro Plan**: $20/mo (8GB RAM, 100GB storage)
- **Database**: Included in plan

**Total:** ~$5-20/month

### Fly.io
- **App Instance**: $5/mo (shared-cpu-1x, 256MB)
- **PostgreSQL**: $0 (free tier) or $2/mo (1GB)

**Total:** ~$5-7/month

### Self-Hosted VPS
- **DigitalOcean Droplet**: $6/mo (1GB RAM)
- **Domain**: $10-15/year
- **Backups**: $1/mo (optional)

**Total:** ~$6-8/month

---

## Next Steps

1. **Choose your deployment platform** (Railway recommended for quick start)
2. **Set up environment variables** with your API keys
3. **Deploy and run migrations**
4. **Configure custom domain**
5. **Test all integrations** (Untappd, GoTab, PMB)
6. **Set up monitoring and backups**
7. **Train your staff** on the system

---

## Support

If you run into issues:
- Check Railway/Fly/VPS logs
- Review database connection
- Verify environment variables
- Test API integrations
- Check firewall/security settings

Good luck with your deployment! 🍺

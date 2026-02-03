# Database Migration Instructions

## Current Status

Your app is deployed and running! The seeding error you see is expected - it means the database tables don't exist yet.

## Running Migrations

### Option 1: Use Railway Dashboard (Recommended)

1. Go to Railway Dashboard → **Taproom-Tracker** service
2. Click on the service
3. Go to **Deployments** tab
4. Click on the latest deployment
5. Look for **"Run Command"** or **"Shell"** option
6. Run: `npm run db:push`

### Option 2: Use Railway CLI with Public URL

The internal `DATABASE_URL` won't work from your local machine. You can:

1. Get the public database URL from Postgres service:
   ```bash
   railway variables --service Postgres | grep DATABASE_PUBLIC_URL
   ```

2. Temporarily set it locally:
   ```bash
   export DATABASE_URL="<public-url-from-above>"
   npm run db:push
   ```

### Option 3: Add Migration to Startup (Future Enhancement)

We could modify the startup process to automatically run migrations, but for now, run them manually.

## Verify Migrations Worked

After running migrations, check the logs:

```bash
railway logs --service Taproom-Tracker --tail 50
```

You should see:
- ✅ No "relation does not exist" errors
- ✅ "Seeded default users" message (if seeding works)
- ✅ App serving successfully

## What Gets Created

The migrations will create:
- `users` table
- `settings` table
- `distributors` table
- `products` table
- `kegs` table
- `taps` table
- `inventory_sessions` table
- `inventory_items` table
- `receiving_sessions` table
- `receiving_items` table
- `orders` table
- `order_items` table
- `pricing_defaults` table
- And other related tables

## After Migrations

Once migrations are complete:
1. ✅ App will seed default users (Owner, Admin, Staff with random PINs)
2. ✅ Default settings will be created
3. ✅ 30 taps will be seeded
4. ✅ You can log in and use the app!

## Default Users

After seeding, default users are created with random PINs. Check the logs to see the PINs (only in development, but you'll need to check Railway logs or reset them).

To reset PINs, you can:
- Use the app's user management (if you can log in)
- Or manually update in the database

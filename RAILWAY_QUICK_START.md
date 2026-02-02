# Railway Quick Start Checklist

Use this checklist to quickly deploy to Railway. Follow the detailed guide in `RAILWAY_DEPLOYMENT.md` for more information.

## Pre-Deployment

- [ ] Code is committed and pushed to Git repository
- [ ] Railway account is ready
- [ ] Have a strong SESSION_SECRET ready (generate with `openssl rand -base64 32`)

## Railway Setup (5-10 minutes)

- [ ] Create new Railway project
- [ ] Connect your Git repository
- [ ] Add PostgreSQL database service
- [ ] Set environment variables:
  - [ ] `NODE_ENV=production`
  - [ ] `SESSION_SECRET=<your-secret>`
  - [ ] `PORT=5000` (optional, Railway sets this automatically)
- [ ] Verify build settings:
  - [ ] Build: `npm run build`
  - [ ] Start: `npm start`

## Deploy

- [ ] Trigger deployment (automatic on push or manual)
- [ ] Watch build logs for errors
- [ ] Wait for deployment to complete (~2-3 minutes)

## Database Setup

- [ ] Run database migrations: `railway run npm run db:push`
  - Or use Railway CLI: `railway run npm run db:push`
- [ ] Verify database tables are created

## Verify

- [ ] Visit Railway-provided URL
- [ ] Test app loads correctly
- [ ] Test login functionality
- [ ] Check Railway logs for any errors
- [ ] Verify metrics are showing (CPU, memory)

## Post-Deployment

- [ ] Test all core features
- [ ] Set up custom domain (optional)
- [ ] Monitor logs for 24 hours
- [ ] Document Railway URL for team

## Common Issues

**Build fails?**
- Check build logs
- Verify `package.json` scripts
- Ensure all dependencies are listed

**Database connection error?**
- Verify `DATABASE_URL` is set (Railway sets this automatically)
- Check database service is running
- Run migrations: `railway run npm run db:push`

**App crashes?**
- Check logs for error messages
- Verify `SESSION_SECRET` is set
- Ensure environment variables are correct

## Next: PMB Bridge Service

Once Railway is stable:
1. ✅ Railway deployment working
2. ⏭️ Set up PMB Bridge Service (see plan)
3. ⏭️ Connect Railway app to PMB Bridge

## Support

- Full guide: `RAILWAY_DEPLOYMENT.md`
- Railway docs: https://docs.railway.app
- Railway Discord: https://discord.gg/railway

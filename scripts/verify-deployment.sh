#!/bin/bash

echo "🔍 Verifying Railway Deployment"
echo "================================"
echo ""

# Check environment variables
echo "📋 Environment Variables:"
railway variables --service Taproom-Tracker 2>&1 | grep -E "DATABASE_URL|SESSION_SECRET|NODE_ENV" | head -3
echo ""

# Check service status
echo "📊 Service Status:"
railway status
echo ""

# Get Railway URL (if available)
echo "🌐 Next Steps:"
echo ""
echo "1. Check Railway Dashboard for service status:"
echo "   https://railway.app/dashboard"
echo ""
echo "2. If service is running, get the URL:"
echo "   - Go to Taproom-Tracker service → Settings → Networking"
echo "   - Or check the Deployments tab for the URL"
echo ""
echo "3. Test health endpoint:"
echo "   curl https://your-app.up.railway.app/health"
echo ""
echo "4. Run database migrations:"
echo "   railway run npm run db:push"
echo ""
echo "5. Monitor logs:"
echo "   railway logs --service Taproom-Tracker --follow"
echo ""

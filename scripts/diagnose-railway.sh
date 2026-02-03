#!/bin/bash

echo "🔍 Railway Project Diagnosis"
echo "============================"
echo ""

# Check Railway status
echo "📊 Current Railway Status:"
railway status
echo ""

# Check who is logged in
echo "👤 Logged in as:"
railway whoami
echo ""

# Check if we can see project info
echo "📦 Project Information:"
railway variables 2>&1 | head -5
echo ""

# Check git status
echo "🌿 Git Status:"
echo "Repository: $(git remote get-url origin)"
echo "Branch: $(git branch --show-current)"
echo "Last commit: $(git log -1 --oneline)"
echo ""

# Instructions
echo "📋 Diagnosis Steps:"
echo ""
echo "1. CHECK IF WEB SERVICE EXISTS:"
echo "   - Go to: https://railway.app/dashboard"
echo "   - Open 'Taproom Tracker' project"
echo "   - Look for services (should see Postgres + Web App)"
echo "   - If only Postgres exists, you need to create the web service"
echo ""
echo "2. CREATE WEB SERVICE (if missing):"
echo "   - In Railway Dashboard → Click '+ New'"
echo "   - Select 'GitHub Repo'"
echo "   - Choose: cthgit-nv/Taproom-Tracker"
echo "   - This will create the webhook automatically"
echo ""
echo "3. VERIFY WEB SERVICE SETTINGS:"
echo "   - Select the WEB SERVICE (not Postgres)"
echo "   - Go to Settings → Source"
echo "   - Verify:"
echo "     * Repository: cthgit-nv/Taproom-Tracker"
echo "     * Branch: main"
echo "     * Auto Deploy: Enabled"
echo ""
echo "4. CHECK GITHUB WEBHOOK:"
echo "   - Go to: https://github.com/cthgit-nv/Taproom-Tracker/settings/hooks"
echo "   - Should see Railway webhook with recent deliveries"
echo ""
echo "5. TEST DEPLOYMENT:"
echo "   git commit --allow-empty -m 'Test deployment'"
echo "   git push origin main"
echo "   - Then check Railway Dashboard → Deployments"
echo ""

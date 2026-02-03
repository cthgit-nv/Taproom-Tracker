#!/bin/bash

# Script to check Railway webhook status and GitHub connection

echo "🔍 Checking Railway-GitHub Webhook Connection"
echo "=============================================="
echo ""

# Check if we're in a git repository
if [ ! -d .git ]; then
    echo "❌ Not in a git repository"
    exit 1
fi

# Get repository info
REPO_URL=$(git remote get-url origin)
echo "📦 Repository: $REPO_URL"
echo ""

# Check current branch
CURRENT_BRANCH=$(git branch --show-current)
echo "🌿 Current branch: $CURRENT_BRANCH"
echo ""

# Check Railway connection
echo "🚂 Railway Status:"
railway status
echo ""

# Instructions for manual webhook check
echo "📋 To verify webhook in GitHub:"
echo "   1. Go to: https://github.com/cthgit-nv/Taproom-Tracker/settings/hooks"
echo "   2. Look for a webhook from Railway (should have 'railway.app' in URL)"
echo "   3. Check recent deliveries for successful requests"
echo ""

# Instructions for Railway dashboard check
echo "📋 To verify connection in Railway:"
echo "   1. Go to: https://railway.app/dashboard"
echo "   2. Select 'Taproom Tracker' project"
echo "   3. Go to Settings → Source"
echo "   4. Verify repository is connected and auto-deploy is enabled"
echo ""

# Test webhook by checking if we can trigger a deployment
echo "🧪 To test webhook:"
echo "   Make a small change and push:"
echo "   git commit --allow-empty -m 'Test webhook'"
echo "   git push origin $CURRENT_BRANCH"
echo "   Then check Railway dashboard for new deployment"
echo ""

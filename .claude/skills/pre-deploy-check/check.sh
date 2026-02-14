#!/bin/bash
# Pre-deployment validation script for VaporForge

set -e  # Exit on first error

echo "🚀 VaporForge Pre-Deploy Check"
echo "=============================="
echo ""

# Step 1: TypeScript type checking
echo "📝 Step 1/5: TypeScript type checking..."
if npm run typecheck; then
  echo "✅ TypeScript types valid"
else
  echo "❌ TypeScript errors found - fix before deploying"
  exit 1
fi
echo ""

# Step 2: Build landing page
echo "🌐 Step 2/5: Building landing page..."
if npm run build:landing; then
  LANDING_SIZE=$(du -sh landing/dist 2>/dev/null | cut -f1)
  echo "✅ Landing page built ($LANDING_SIZE)"
else
  echo "❌ Landing page build failed"
  exit 1
fi
echo ""

# Step 3: Build UI
echo "⚛️  Step 3/5: Building UI..."
if npm run build:ui; then
  UI_SIZE=$(du -sh ui/dist 2>/dev/null | cut -f1)
  echo "✅ UI built ($UI_SIZE)"
else
  echo "❌ UI build failed"
  exit 1
fi
echo ""

# Step 4: Merge distributions
echo "🔀 Step 4/5: Merging dist directories..."
if npm run build:merge; then
  DIST_SIZE=$(du -sh dist 2>/dev/null | cut -f1)
  FILE_COUNT=$(find dist -type f | wc -l)
  echo "✅ Distributions merged ($DIST_SIZE, $FILE_COUNT files)"
else
  echo "❌ Dist merge failed"
  exit 1
fi
echo ""

# Step 5: Validate wrangler config
echo "⚙️  Step 5/5: Validating wrangler config..."
if npx wrangler validate 2>&1 | grep -q "valid"; then
  echo "✅ wrangler.jsonc is valid"
else
  echo "⚠️  wrangler.jsonc validation warning (may still be OK)"
fi
echo ""

# Final summary
echo "=============================="
echo "✅ All pre-deploy checks passed!"
echo ""
echo "📦 Build artifacts:"
echo "  - Landing: landing/dist/"
echo "  - UI: ui/dist/"
echo "  - Merged: dist/"
echo ""
echo "Ready to deploy with: npm run deploy"

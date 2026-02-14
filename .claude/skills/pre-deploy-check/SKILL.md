---
name: pre-deploy-check
description: Validate build steps and configuration before deployment to Cloudflare
disable-model-invocation: true
tools: Bash, Read, Grep
---

# Pre-Deploy Check Skill

Validates the VaporForge build process and configuration before deployment to prevent CI failures.

## What This Skill Does

1. **TypeScript Type Checking** - Ensures no type errors
2. **Landing Page Build** - Validates Astro build succeeds
3. **UI Build** - Validates React/Vite build succeeds
4. **Dist Merge** - Verifies the merge script works
5. **Wrangler Config** - Checks wrangler.jsonc is valid
6. **Environment Check** - Confirms required secrets are referenced

## Workflow

When invoked, this skill runs through the complete build pipeline locally:

```bash
# 1. Type checking
npm run typecheck

# 2. Build landing page
npm run build:landing

# 3. Build UI
npm run build:ui

# 4. Merge distributions
npm run build:merge

# 5. Validate wrangler config
npx wrangler validate

# 6. Check for dist/ output
ls -lh dist/
```

## Usage

Invoke this skill before pushing to main or creating a PR:

```bash
/pre-deploy-check
```

## Exit Codes

- **0** - All checks passed, safe to deploy
- **Non-zero** - Build failure detected, fix before deploying

## Expected Output

The skill will report:
- ✅ TypeScript compilation status
- ✅ Landing page build size
- ✅ UI build size and bundle info
- ✅ Merged dist/ directory contents
- ✅ Wrangler configuration validity
- ❌ Any errors encountered with suggestions

## Notes

- This runs the full build pipeline (~30-60 seconds)
- Does NOT actually deploy (use `npm run deploy` for that)
- Useful for catching issues before CI/CD runs
- Safe to run repeatedly (idempotent)

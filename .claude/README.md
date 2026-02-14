# VaporForge Claude Code Configuration

This directory contains Claude Code automations for the VaporForge project.

## 📁 Structure

```
.claude/
├── settings.json          # Hooks and permissions
├── skills/                # Custom skills
│   └── pre-deploy-check/  # Pre-deployment validation
└── README.md             # This file
```

## ⚡ Hooks

### TypeScript Type Check (Auto-runs on Edit/Write)

Automatically runs `npm run typecheck` after editing or writing files to catch type errors immediately.

**Configured in**: `settings.json` → `hooks.postToolUse`

## 🎯 Skills

### `/pre-deploy-check`

Validates the entire build pipeline before deployment:

1. ✅ TypeScript type checking
2. ✅ Landing page build (Astro)
3. ✅ UI build (React/Vite)
4. ✅ Distribution merge
5. ✅ Wrangler config validation

**Usage**:
```bash
/pre-deploy-check
```

**Script**: `skills/pre-deploy-check/check.sh` (can also run directly)

## 🔌 MCP Servers

### Cloudflare Workers MCP

Configured in `.mcp.json` at project root. Enables:
- KV store management
- R2 bucket operations
- Durable Object inspection
- Worker logs browsing

**Activation**: Add to Claude Code MCP settings panel with your Cloudflare credentials.

### GitHub MCP

Manage issues, PRs, and workflows directly from Claude.

**Prerequisites**: Install `gh` CLI first

## 🔒 Permissions

The following Bash commands are whitelisted:
- `npm run typecheck:*`
- `npm run test:*`
- `npm run build:*`
- `wrangler deploy:preview`

**Blocked for safety**:
- `wrangler deploy` (production)
- `git push:main` (requires explicit approval)

## 🚀 Next Steps

1. **Test the hook**: Edit any TypeScript file and watch the type check run automatically
2. **Try the skill**: Run `/pre-deploy-check` before your next deployment
3. **Add MCP servers**: Go to Settings → MCP in VaporForge UI and paste `.mcp.json` config

## 📝 Adding More Automations

- **Hooks**: Edit `settings.json`
- **Skills**: Create new folder in `skills/` with `SKILL.md`
- **MCP Servers**: Add to `.mcp.json` in project root

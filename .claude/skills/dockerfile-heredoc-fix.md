---
name: dockerfile-heredoc-fix
description: Diagnose and fix Dockerfile heredoc parse failures on GitHub Actions / Cloudflare Containers. Covers BuildKit syntax directives, DOCKER_BUILDKIT env, and cache pruning.
---

# /dockerfile-heredoc-fix — Dockerfile Heredoc Parse Failure

Run this when `wrangler deploy` (or any Docker build) fails with errors like:

```
dockerfile parse error on line NN: unknown instruction: //
```

...where the "unknown instruction" is actually the **body** of a heredoc that Docker failed to parse.

## Root Cause

VaporForge's Dockerfile embeds large Node.js scripts via shell heredocs:

```dockerfile
RUN cat > /opt/claude-agent/claude-agent.js << 'CLAUDE_AGENT_EOF'
#!/usr/bin/env node
// This line gets misread as a Dockerfile instruction
...
CLAUDE_AGENT_EOF
```

Docker's **legacy Dockerfile frontend** does NOT support multi-line heredocs. It treats `RUN cat > file << 'EOF'` as a single-line `RUN` command, then parses every subsequent line as a Dockerfile instruction. `#!` lines are parsed as comments (silent), but `//` (JS comments), `const`, `let`, etc. trigger `unknown instruction` errors.

**Heredoc support requires BuildKit** with the modern Dockerfile frontend (syntax >= 1.4).

## Why It Worked Before

Previous container images were cached by Cloudflare. If the Dockerfile content hash didn't change, `wrangler deploy` skipped the build entirely ("Image already exists remotely, skipping push"). The heredocs were never actually re-parsed — the running image was built from an earlier time when the build environment supported them (or was built locally with BuildKit enabled).

Any Dockerfile change (adding/removing scripts, bumping `VF_CONTAINER_BUILD`) invalidates the hash, triggers a fresh build, and exposes the heredoc parse failure.

## Fix Checklist

### 1. Add `# syntax=docker/dockerfile:1` as the FIRST line of the Dockerfile

```dockerfile
# syntax=docker/dockerfile:1
# VaporForge Sandbox - Cloudflare Container
FROM docker.io/cloudflare/sandbox:0.7.0
```

**Critical:** This MUST be the very first line. No comments, blank lines, or BOMs before it. It tells Docker to pull the modern BuildKit frontend from Docker Hub, which understands heredoc syntax.

### 2. Set `DOCKER_BUILDKIT=1` in the deploy environment

In `.github/workflows/deploy.yml`:

```yaml
- name: Deploy to Cloudflare Workers
  run: npx wrangler deploy
  env:
    DOCKER_BUILDKIT: "1"
    CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
```

Belt-and-suspenders: ensures BuildKit is active even if the runner's Docker defaults change.

### 3. Prune Docker cache before deploy

Add a step before the deploy step:

```yaml
- name: Prune Docker cache
  run: docker builder prune --all -f && docker image prune -a -f
```

This prevents stale cached layers from masking Dockerfile changes. Without pruning, Docker may reuse old layers and produce the same image hash even though the Dockerfile changed.

## Diagnostic Steps

If the build still fails after these fixes:

### Check 1: Verify syntax directive is first line
```bash
head -1 Dockerfile
# Must output exactly: # syntax=docker/dockerfile:1
```

### Check 2: Verify no BOM or hidden chars
```bash
od -c Dockerfile | head -3
# First char must be '#', not \357\273\277 (UTF-8 BOM)
```

### Check 3: Check Docker version on runner
```bash
docker --version
docker buildx version
```
BuildKit heredocs require Docker 20.10+ with BuildKit. GitHub Actions `ubuntu-latest` runners have Docker 24+ (sufficient).

### Check 4: Test heredoc locally
```bash
DOCKER_BUILDKIT=1 docker build --no-cache -f Dockerfile .
```

## Resolution (2026-03-01)

**`# syntax=docker/dockerfile:1` did NOT fix the issue.** The Cloudflare / GH Actions builder still failed to parse heredocs even with the BuildKit syntax directive.

**Final fix: Replace all heredocs with COPY instructions.**

```dockerfile
# Before (broken — heredocs need BuildKit):
RUN cat > /opt/claude-agent/claude-agent.js << 'CLAUDE_AGENT_EOF'
#!/usr/bin/env node
...
CLAUDE_AGENT_EOF

# After (works everywhere — standard COPY):
COPY src/sandbox-scripts/claude-agent.js /opt/claude-agent/claude-agent.js
RUN chmod +x /opt/claude-agent/claude-agent.js
```

The Dockerfile shrank from 1981 lines to 56. `COPY` works because wrangler builds locally on the GH Actions runner where the full repo is the build context. The old CLAUDE.md warning ("Dockerfile COPY fails on CF") was outdated.

## Current Script Sync Workflow

After editing ANY sandbox script:
1. Edit the file in `src/sandbox-scripts/`
2. Bump `VF_CONTAINER_BUILD` env in Dockerfile
3. The `COPY` instructions pick up changes automatically — no heredoc duplication needed
4. Deploy workflow prunes Docker cache automatically

## Related CLAUDE.md Gotchas

- **Dockerfile uses COPY for scripts** — Do NOT reintroduce heredocs. They require BuildKit which builders may lack.
- **Container image "skipping push" trap** — if `wrangler deploy` says "Image already exists remotely, skipping push" but you changed the Dockerfile, Docker cached layers produced the same hash. Fix: full prune before deploy.
- **Container scripts MUST stay in sync** — `src/sandbox-scripts/*.js` is source of truth. Edit there, bump `VF_CONTAINER_BUILD`, and COPY handles the rest.

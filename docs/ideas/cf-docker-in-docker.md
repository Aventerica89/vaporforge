**Added:** 2026-03-18
**Status:** Idea
**Category:** Infrastructure / Sandbox

## Summary

CF Sandbox supports Docker-in-Docker (rootless) — the sandbox container can build and run other containers inside itself. This transforms VaporForge from a Claude Code terminal into a full dev environment that can run the user's actual application.

Source: https://developers.cloudflare.com/sandbox/guides/docker-in-docker/

## How It Works

- Uses `docker:dind-rootless` base image (CF containers run without root)
- `dockerd` starts with `--iptables=false` (CF doesn't support iptables manipulation)
- Containers inside the sandbox use `--network=host`
- Docker commands run via the sandbox SDK
- Storage is ephemeral — needs manual persistence strategy for built images

## What This Enables for VaporForge

### 1. Dev Server Previews (High Value)
User clones a repo, Claude builds and runs it inside the sandbox. The dev server is accessible via port forwarding. User sees their app running alongside Claude's code edits — like Agency mode but for any framework, not just Astro.

**Flow:**
1. User: "clone my-app and run it"
2. Claude: git clone, npm install, npm run dev
3. Or: docker build + docker run with host networking
4. VF proxies the port — user sees live preview in iframe

### 2. Build and Test Pipelines
Claude can build Docker images from user's Dockerfiles, run test suites in isolated containers, and validate builds — all without leaving the sandbox.

### 3. Multi-Service Stacks
Run a database + backend + frontend together on host networking so they communicate via localhost.

### 4. Custom Runtime Environments
User needs Python 3.12, Ruby, Java, etc. — instead of pre-installing everything in the VF Dockerfile, Claude can pull the right runtime on demand.

## Limitations

| Limitation | Impact | Workaround |
|-----------|--------|------------|
| No root | Can't use privileged operations | Rootless Docker handles most cases |
| No iptables | Can't use Docker networking bridges | Host networking for everything |
| Ephemeral storage | Built images lost when sandbox sleeps | Push to registry, or rebuild on wake |
| Resource limits | Sandbox has finite CPU/RAM | Can't run heavy multi-container stacks |

## Relationship to Container Swarm Vision

The container swarm idea (`dynamic-container-swarm.md`) envisions multiple specialized containers orchestrated by a central DO. Docker-in-Docker is a simpler alternative for single-user scenarios:

| Approach | Use Case |
|----------|----------|
| **Docker-in-Docker** | Single user running their app alongside Claude in one sandbox |
| **Container Swarm** | Multi-agent, multi-container orchestration for complex workflows |

DinD is the v1 approach (works today with Dockerfile changes). Container swarm is the v2 architecture.

## Implementation Path

### Phase 1: Enable DinD in VF Sandbox
1. Update Dockerfile to include rootless Docker daemon
2. Add startup script to launch dockerd alongside Claude agent
3. Test basic Docker operations inside the sandbox
4. Verify resource impact (memory/CPU overhead of dockerd)

### Phase 2: Dev Server Preview Integration
1. Add port forwarding from sandbox to browser (similar to Agency mode iframe)
2. Claude detects running servers and reports available ports
3. UI shows "Preview" button that opens proxied port in iframe
4. Could reuse Agency mode's iframe component

### Phase 3: Smart Runtime Detection
1. Claude reads repo's Dockerfile or docker-compose.yml
2. Automatically builds and runs the appropriate stack
3. Reports status and available endpoints to user

## Dockerfile Changes Required

Current VF Dockerfile uses `cloudflare/sandbox` as base. Options:
- **Option A:** Multi-stage build — install rootless Docker into the sandbox image
- **Option B:** Compose docker:dind-rootless with sandbox binary overlay (CF's documented approach)
- **Option C:** Install Docker CLI only, use a sidecar DinD container

Option B matches CF's documented approach. Needs testing for compatibility with our Claude agent scripts.

## Priority

P2 — Not needed for alpha launch, but high-value for post-launch differentiation. "Run your app inside VaporForge" is a compelling demo.

## Next Steps

1. Test: can we add rootless Docker to the current VF sandbox image without breaking Claude agent?
2. Measure: memory/CPU overhead of running dockerd alongside Claude
3. Prototype: build a simple Node.js app inside the sandbox, verify port access
4. Design: how does the UI surface running containers and their ports?

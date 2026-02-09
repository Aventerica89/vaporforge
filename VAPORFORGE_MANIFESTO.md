# The VaporForge Manifesto

## How to Run Claude Code From Any Device on Earth

**Version:** 1.0
**Date:** February 7, 2026
**Author:** JB + Claude Code (Opus 4.6)
**Live:** https://vaporforge.jbcloud.app
**Repo:** github.com/Aventerica89/VaporForge

---

## Table of Contents

1. [The Problem](#1-the-problem)
2. [The Theory](#2-the-theory)
3. [Architecture Overview](#3-architecture-overview)
4. [The Auth Problem (What Didn't Work)](#4-the-auth-problem-what-didnt-work)
5. [The SDK Problem (What Didn't Work)](#5-the-sdk-problem-what-didnt-work)
6. [The Container Problem (What Didn't Work)](#6-the-container-problem-what-didnt-work)
7. [The Terminal Streaming Problem (What Didn't Work)](#7-the-terminal-streaming-problem-what-didnt-work)
8. [How It Actually Works (The Final Architecture)](#8-how-it-actually-works-the-final-architecture)
9. [The Auth Flow (Final)](#9-the-auth-flow-final)
10. [The Chat System (SDK in Container)](#10-the-chat-system-sdk-in-container)
11. [The Terminal System (CLI Streaming)](#11-the-terminal-system-cli-streaming)
12. [The Container (Dockerfile)](#12-the-container-dockerfile)
13. [The Frontend](#13-the-frontend)
14. [File and Git Operations](#14-file-and-git-operations)
15. [Session Lifecycle](#15-session-lifecycle)
16. [Hardware and Platform Requirements](#16-hardware-and-platform-requirements)
17. [Reproducing This From Scratch](#17-reproducing-this-from-scratch)
18. [Resources That Cracked the Code](#18-resources-that-cracked-the-code)
19. [The Complete File Map](#19-the-complete-file-map)
20. [Lessons Learned](#20-lessons-learned)

---

## 1. The Problem

Claude Code is the most powerful coding tool available. It reads your codebase, writes code, runs
tests, commits to git, and does it all from the terminal. But it has one fatal constraint:

**It only runs locally.**

You need a laptop. You need Node.js 20+. You need a terminal. You need the CLI installed. If you
are on your phone, a tablet, a Chromebook, a friend's computer, or any machine where you can not
install software, you are locked out.

VaporForge fixes this. It runs Claude Code in the cloud and gives you a web-based IDE to interact
with it from any device with a browser. Your phone. Your iPad. A public library computer. Anything.

The key insight: Cloudflare has a product called **Containers** (formerly Sandboxes) that gives you
real Linux containers running on their edge network. You can install Claude Code inside one of these
containers and interact with it over HTTP. That is the entire premise.

---

## 2. The Theory

The architecture follows a three-layer model:

```
Layer 1: Browser (React SPA)
    |
    | HTTP/SSE
    v
Layer 2: Cloudflare Worker (Hono API server)
    |
    | Durable Object RPC
    v
Layer 3: Cloudflare Container (Linux, Node.js, Claude Code CLI + Agent SDK)
    |
    | HTTPS
    v
Layer 4: Anthropic API (Claude Sonnet 4.5)
```

**Layer 1** is a standard React + Vite SPA with a Monaco code editor, file explorer, terminal, and
chat panel. It communicates with Layer 2 via REST and Server-Sent Events.

**Layer 2** is a Cloudflare Worker running Hono (a lightweight web framework). It handles
authentication, session management, and orchestrates all communication with the container. It stores
state in KV (key-value store) and files in R2 (object storage).

**Layer 3** is the actual Linux container. It runs Ubuntu with Node.js, the Claude Code CLI, and the
Claude Agent SDK installed. This is where Claude actually runs. The container has a full filesystem,
can run shell commands, and maintains state between requests.

**Layer 4** is the Anthropic API. The user's OAuth token (from their Claude Pro/Max subscription) is
passed through all layers to authenticate with Anthropic. VaporForge never stores or uses its own
API key. It uses the user's subscription.

### Why This Architecture?

The critical constraint is that the Claude Agent SDK **must run in a long-lived process**, not in a
stateless serverless function. Workers have a 30-second CPU time limit and no persistent filesystem.
Containers have neither limitation. Anthropic's own documentation says:

> "For hosting the SDK, use a long-running server process that can maintain state across requests."

So the Worker is the orchestrator, and the Container is the executor.

---

## 3. Architecture Overview

```
+-------------------+     +--------------------+     +---------------------+
|                   |     |                    |     |                     |
|  Browser (React)  |---->|  Worker (Hono)     |---->|  Container (Linux)  |
|                   |     |                    |     |                     |
|  - Monaco Editor  |     |  - Auth (JWT)      |     |  - Claude Code CLI  |
|  - File Explorer  |     |  - Session Mgmt    |     |  - Agent SDK        |
|  - Terminal       |     |  - KV Storage      |     |  - Node.js 20       |
|  - Chat Panel     |     |  - R2 Files        |     |  - Git, curl, jq    |
|  - Git Panel      |     |  - SSE Streaming   |     |  - Full filesystem  |
|                   |     |                    |     |                     |
+-------------------+     +--------------------+     +---------------------+
                                                              |
                                                              v
                                                     +------------------+
                                                     | Anthropic API    |
                                                     | (Claude Sonnet)  |
                                                     +------------------+
```

### Cloudflare Services Used

| Service | Purpose | Binding |
|---------|---------|---------|
| Workers | API server (Hono) | Main entrypoint |
| Containers | Linux sandbox for Claude | SANDBOX_CONTAINER |
| KV | Auth tokens, sessions, messages | AUTH_KV, SESSIONS_KV |
| R2 | File persistence | FILES_BUCKET |
| Durable Objects | WebSocket state, session DO | SESSIONS |

---

## 4. The Auth Problem (What Didn't Work)

Authentication was the single hardest part of the entire project. Here is the journey, commit by
commit.

### Attempt 1: Direct API Key (commit 62b07dc)
The first version just took an Anthropic API key from the user. Problem: VaporForge's entire point
is to use your existing Claude Pro/Max subscription. API keys are for the paid API, which is
separate from the subscription. Users with Pro/Max don't have API keys.

### Attempt 2: OAuth Flow (commit 068f1b1)
Implemented a full OAuth2 authorization code flow. Modeled after 1Code's approach: redirect to
Anthropic's auth server, get a code, exchange for tokens. Problem: Anthropic's OAuth endpoints are
designed for first-party apps (Claude Desktop, Claude Code CLI). Third-party apps can not register
as OAuth clients. The flow kept failing with cryptic errors.

### Attempt 3: API Key Simplification (commit 210ef4b)
Gave up on OAuth, went back to API keys only. Immediately reverted (b93b737) because this defeats
the purpose. Users don't have API keys.

### Attempt 4: OAuth Token Validation (commits 196b704, c8b189e)
Tried validating OAuth access tokens directly against Anthropic's token endpoint. Tried Bearer
auth, then x-api-key header. Neither worked because the Messages API doesn't accept OAuth tokens.
They are only for Claude Code CLI.

### Attempt 5: Setup Token (commit e56d958) -- THE SOLUTION
The breakthrough: Claude Code CLI has a command called `claude setup-token`. It outputs an OAuth
access token (sk-ant-oat01-...) that the CLI uses internally. This token is what Claude Code
sends to Anthropic's API.

The solution: users run `claude setup-token` in their local terminal, copy the token, and paste it
into VaporForge's login form. VaporForge validates the format (must start with sk-ant-oat01-),
creates a user record in KV, issues a session JWT, and stores the Claude token per-user.

**Why this works:** The token is the same credential Claude Code CLI uses. When VaporForge injects
it as CLAUDE_CODE_OAUTH_TOKEN in the container environment, Claude Code CLI picks it up and
authenticates with Anthropic's API as if the user were running it locally.

**Why it took 8 attempts:** Anthropic's auth model is unusual. OAuth tokens exist but are not
validated via standard OAuth introspection endpoints. API keys exist but are a separate billing
product. The only path that works for subscription users is the CLI's own token format.

### Security Rules Established
- OAuth tokens only (sk-ant-oat01-*)
- API keys explicitly rejected with helpful error message
- Token stored per-user in KV with 30-day TTL
- Session JWT issued with 24-hour expiry
- JWT secret stored as Worker secret (not in code)

---

## 5. The SDK Problem (What Didn't Work)

### Attempt 1: SDK in Worker (commit 0ba3839)
Imported @anthropic-ai/claude-agent-sdk directly into the Worker. Called query() from the API
handler. It worked for single messages but had a fatal flaw: **no conversation memory**.

Every request was stateless. Claude could not remember what you said 30 seconds ago. The SDK's
resume parameter needs a persistent process to maintain session state. Workers are stateless.
Each request might hit a different isolate.

### Attempt 2: SDK in Container (commit 8f53ed3) -- THE SOLUTION
Moved SDK execution into the Cloudflare Container. The container is a persistent Linux environment
that maintains state. Created claude-agent.js, a Node.js script that:

1. Imports the Claude Agent SDK
2. Calls query() with the user's prompt
3. Passes resume: sessionId for conversation continuity
4. Streams output as JSON lines to stdout
5. Worker parses stdout lines and forwards them as SSE to the browser

**The key insight:** The container is the right place for the SDK because it is a long-lived process
with a real filesystem. The Worker is the wrong place because it is stateless and short-lived.

### Dockerfile COPY Bug
The Dockerfile initially used COPY claude-agent.js /workspace/ to add the script. This failed
silently in Cloudflare's container build system. The build context does not include local files the
same way Docker normally does.

**Fix:** Embed the script directly in the Dockerfile using a heredoc:
```dockerfile
RUN cat > /workspace/claude-agent.js << 'CLAUDE_AGENT_EOF'
// ... entire script ...
CLAUDE_AGENT_EOF
```

### NODE_PATH Bug
The SDK installed globally via npm install -g but Node could not find it when running in the
container via the sandbox exec API. The container's exec environment does not inherit Dockerfile
ENV directives.

**Fix:** Pass NODE_PATH=/usr/local/lib/node_modules explicitly in the exec environment:
```typescript
await sandbox.exec(command, {
  env: { NODE_PATH: '/usr/local/lib/node_modules' }
});
```

### SDK API Shape
The SDK query() function signature:
```typescript
query({ prompt, options: { model, cwd, resume, includePartialMessages } })
```

It returns an async iterable of events:
- { type: 'system', subtype: 'init', session_id } -- session initialized
- { type: 'stream_event', event: { type: 'content_block_delta', delta: { text } } } -- text
- { type: 'assistant', message: { content: [{ type: 'text', text }] } } -- complete message
- { type: 'result', session_id } -- final session ID

Note: session_id is snake_case, not camelCase. This caused a bug that took an hour to find.

---

## 6. The Container Problem (What Didn't Work)

### Cloudflare Containers Are New
As of early 2026, Cloudflare Containers are in public beta. Documentation is sparse. The SDK
(@cloudflare/sandbox) has TypeScript types but limited examples.

### The getSandbox() Pattern
Getting a container instance requires a Durable Object namespace binding:
```typescript
import { getSandbox } from '@cloudflare/sandbox';
const sandbox = getSandbox(namespace, sessionId, { sleepAfter: '10m' });
```

The sleepAfter parameter puts the container to sleep after 10 minutes of inactivity to save
resources. Waking a sleeping container takes about 2 seconds.

### Container Image Building
Container images are built remotely by Cloudflare, not locally. On Apple Silicon Macs, the image
(linux/amd64) cannot run locally. This means you cannot test container behavior on your Mac. You
have to deploy and test in production.

### wrangler deploy Hanging
Multiple times during development, wrangler deploy would hang indefinitely after uploading assets.
The workaround: use npx wrangler deploy instead of the globally installed wrangler.

### Sleep/Wake Lifecycle
Containers auto-sleep after the configured sleepAfter duration. The first request to a sleeping
container wakes it. The SDK handles this transparently. getSandbox() returns a proxy that wakes
the container on first method call.

Session status lifecycle: creating -> active -> sleeping -> active (wake) -> terminated

---

## 7. The Terminal Streaming Problem (What Didn't Work)

### The Original Terminal
The terminal started as a simple exec-and-wait interface. Type a command, wait for it to finish,
see the output. This worked for ls and git status but was completely broken for Claude CLI:

1. **No auth:** The exec endpoint did not inject the OAuth token into the environment
2. **30s timeout:** Claude responses take 10-60 seconds. The default 30s timeout killed them.
3. **No streaming:** Output only appeared after the command finished. For a 30-second Claude
   response, you would stare at a blank terminal wondering if anything was happening.

### The Fix (February 7, 2026)

**Step 1: Inject env vars into exec**
Added CLAUDE_CODE_OAUTH_TOKEN and NODE_PATH to the exec endpoint's environment. Changed
default timeout from 30s to 300s (5 minutes).

**Step 2: SSE streaming endpoint**
Added POST /sessions/:id/exec-stream that uses sandbox.execStream() to get a ReadableStream
of stdout/stderr chunks. Pipes them through a TransformStream as SSE events.

**Step 3: Frontend streaming**
Added sessionsApi.execStream(), an async generator that yields SSE chunks. The Zustand store
detects claude commands and routes them through this streaming path. Non-claude commands stay on
the fast non-streaming path.

**Step 4: Auto-prompt wrapping**
Added isShellCommand() detection. If the user types something that does not look like a shell
command (e.g., "what is the meaning of life?"), it auto-wraps it as
claude -p "what is the meaning of life?". This makes the terminal feel like a Claude-first
interface.

### Why claude -p Does Not Stream Visibly
claude -p (print mode) buffers its entire response before printing to stdout. The SSE streaming
infrastructure is still valuable because:
1. It keeps the HTTP connection alive for 5 minutes (prevents timeout)
2. It shows a "Running command" indicator while waiting
3. It would stream properly for commands that produce incremental output

---

## 8. How It Actually Works (The Final Architecture)

### Request Flow: User Sends a Chat Message

```
1. User types "What color is a banana?" in chat panel
2. Browser: POST /api/chat/stream { sessionId, message }
3. Worker: Verify JWT -> Get user from KV -> Validate OAuth token
4. Worker: Get session from KV -> Get sdkSessionId for resume
5. Worker: Run in container:
   node /workspace/claude-agent.js 'What color is a banana?' 'sdk-session-123' '/workspace'
   with env: { CLAUDE_CODE_OAUTH_TOKEN: 'sk-ant-oat01-...', NODE_PATH: '...' }
6. Container: claude-agent.js calls SDK query() with resume
7. Container: SDK calls Anthropic API with the user's OAuth token
8. Container: Streams JSON lines to stdout:
   {"type":"session-init","sessionId":"abc123"}
   {"type":"text-delta","text":"A banana"}
   {"type":"text-delta","text":" is typically"}
   {"type":"text-delta","text":" yellow."}
   {"type":"done","sessionId":"abc123","fullText":"A banana is typically yellow."}
9. Worker: Parses stdout lines, forwards as SSE events
10. Browser: Renders streaming text in chat panel
11. Worker: Saves assistant message to KV, updates sdkSessionId for next turn
```

### Request Flow: User Types in Terminal

```
1. User types "what is 2+2" in terminal
2. Terminal: Detects not a shell command -> wraps as: claude -p "what is 2+2"
3. Terminal: Detects starts with "claude" -> routes to streaming path
4. Browser: POST /api/sessions/:id/exec-stream { command: 'claude -p "what is 2+2"' }
5. Worker: Validates session, injects env vars
6. Worker: sandbox.execStream('claude -p "what is 2+2"', { env, timeout: 300s })
7. Container: Runs claude CLI with OAuth token
8. Container: CLI calls Anthropic API, generates response
9. Container: Writes "2 + 2 = 4" to stdout
10. Worker: Reads stream, wraps as SSE: data: {"type":"stdout","content":"2 + 2 = 4"}
11. Browser: Appends to terminal output
```

### Request Flow: User Runs a Shell Command

```
1. User types "ls /workspace" in terminal
2. Terminal: Detects "ls" is a shell command -> no wrapping
3. Terminal: Detects NOT a claude command -> uses non-streaming path
4. Browser: POST /api/sessions/:id/exec { command: "ls /workspace" }
5. Worker: sandbox.exec("ls /workspace", { env, timeout: 300s })
6. Container: Runs ls, returns stdout
7. Browser: Shows output immediately
```

---

## 9. The Auth Flow (Final)

### Login Sequence

```
1. User opens vaporforge.jbcloud.app
2. Sees login screen: "Paste your setup token"
3. User opens their local terminal, runs: claude setup-token
4. Claude CLI outputs: sk-ant-oat01-dYaWDTs5nxFXax1Rv3BEI4lzTI2np2dt...
5. User copies token, pastes into login form
6. Browser: POST /api/auth/setup { token: "sk-ant-oat01-..." }
7. Worker:
   a. Validates format (must start with sk-ant-oat01- or sk-ant-api01-)
   b. Hashes token with SHA-256 to derive user ID
   c. Creates or updates user in KV: { id, email, claudeToken, createdAt }
   d. Creates JWT with 24-hour expiry
8. Browser: Stores JWT in localStorage as session_token
9. All subsequent requests include: Authorization: Bearer <jwt>
```

### JWT Implementation
Custom JWT using Web Crypto API (no external dependencies):
- Algorithm: HMAC-SHA256
- Payload: { sub: userId, email, iat, exp }
- Secret: JWT_SECRET (set via wrangler secret put JWT_SECRET)
- For local dev: .dev.vars file with dev-only secret

### Why Not Use a Standard JWT Library?
Workers have limited npm compatibility. The Web Crypto API is available natively and handles
HMAC-SHA256 without any imports. The implementation is about 60 lines in src/auth.ts.

---

## 10. The Chat System (SDK in Container)

### The claude-agent.js Script

This is the heart of VaporForge. It runs inside the container and bridges the Claude Agent SDK
with the Worker's API.

**Location:** Embedded in the Dockerfile via heredoc at /workspace/claude-agent.js

**Input:** Command-line arguments
```
node claude-agent.js <prompt> [sessionId] [cwd]
```

**Output:** JSON lines on stdout
```json
{"type": "session-init", "sessionId": "abc123"}
{"type": "text-delta", "text": "Hello"}
{"type": "text-delta", "text": " world"}
{"type": "done", "sessionId": "abc123", "fullText": "Hello world"}
```

**Error output:**
```json
{"type": "error", "error": "Token expired"}
```

### Conversation Continuity

The SDK maintains conversation state via session IDs. The flow:

1. First message: No sessionId argument -> SDK creates new session
2. claude-agent.js emits session-init with the new ID
3. Worker stores sdkSessionId in the session's KV record
4. Next message: Worker passes stored sdkSessionId as argument
5. claude-agent.js passes it as resume: sessionId to query()
6. SDK resumes the conversation with full context

This means Claude remembers everything you said in a session. "Remember, bananas are yellow"
followed by "What color?" works correctly.

### The Streaming Chat Endpoint

POST /api/chat/stream uses SSE (Server-Sent Events):

1. Worker creates a TransformStream
2. Returns the readable side immediately as a text/event-stream response
3. Uses c.executionCtx.waitUntil() to process in the background
4. Calls execInSandbox() to run claude-agent.js
5. Parses stdout JSON lines
6. Writes SSE events to the writable side: data: {"type":"text","content":"..."}\n\n
7. Closes with data: [DONE]\n\n

---

## 11. The Terminal System (CLI Streaming)

### Two Paths

The terminal has two paths based on what the user types:

**Non-streaming (fast commands):**
- Triggered when command does not start with claude
- Uses POST /api/sessions/:id/exec
- Calls sandbox.exec() which waits for completion
- Returns { stdout, stderr, exitCode } as JSON
- Good for: ls, git status, npm install, env, etc.

**Streaming (claude commands):**
- Triggered when command starts with claude
- Uses POST /api/sessions/:id/exec-stream
- Calls sandbox.execStream() which returns a ReadableStream
- Pipes chunks as SSE events in real-time
- 5-minute timeout (vs 30s for standard exec)
- Good for: claude -p "...", any long-running command

### Auto-Prompt Wrapping

The Terminal component detects "naked messages," text that is not a shell command:

```typescript
const SHELL_COMMANDS = new Set([
  'ls', 'cd', 'pwd', 'cat', 'echo', 'grep', 'find', 'mkdir', ...
  'git', 'npm', 'npx', 'node', 'python', 'claude', ...
]);

function isShellCommand(input: string): boolean {
  const firstWord = input.split(/\s+/)[0];
  if (SHELL_COMMANDS.has(firstWord)) return true;
  if (firstWord.startsWith('./') || firstWord.startsWith('/')) return true;
  if (firstWord.includes('=')) return true; // env var assignment
  return false;
}
```

If isShellCommand() returns false, the input is wrapped:
```
"what is 2+2" -> claude -p "what is 2+2"
```

Additionally, bare claude commands get -p auto-appended:
```
claude "hello" -> claude -p "hello"
```

This is necessary because the sandbox exec does not provide a TTY, and claude without -p
requires an interactive terminal.

---

## 12. The Container (Dockerfile)

```dockerfile
FROM docker.io/cloudflare/sandbox:0.7.0

# Claude Code CLI (for terminal usage)
RUN npm install -g @anthropic-ai/claude-code

# Agent SDK (for chat panel with conversation continuity)
RUN npm install -g @anthropic-ai/claude-agent-sdk@latest && \
    cd /workspace && npm init -y && \
    npm install @anthropic-ai/claude-agent-sdk@latest
ENV NODE_PATH=/usr/local/lib/node_modules

# Dev tools
RUN apt-get update && apt-get install -y git curl jq \
    && rm -rf /var/lib/apt/lists/*

# 5 minute timeout for AI responses
ENV COMMAND_TIMEOUT_MS=300000

# Workspace
RUN mkdir -p /workspace

# SDK wrapper script (embedded, not COPYed)
RUN cat > /workspace/claude-agent.js << 'CLAUDE_AGENT_EOF'
#!/usr/bin/env node
// ... (120 lines of SDK wrapper) ...
CLAUDE_AGENT_EOF
RUN chmod +x /workspace/claude-agent.js
```

### Base Image: cloudflare/sandbox:0.7.0
- Ubuntu 20.04 base
- Node.js 20 pre-installed
- npm pre-installed
- Sandbox SDK integration (exec, filesystem, git)

### What Is Installed
- @anthropic-ai/claude-code -- The CLI (for terminal claude -p commands)
- @anthropic-ai/claude-agent-sdk -- The SDK (for chat panel with memory)
- git, curl, jq -- Essential dev tools

### Image Size and Build Time
- Build: about 20 seconds (most layers cached after first build)
- Image: Built remotely by Cloudflare (linux/amd64)
- Cannot build locally on Apple Silicon (but that is fine)

---

## 13. The Frontend

### Tech Stack
- **React 18** with TypeScript
- **Vite 6** for bundling
- **Tailwind CSS 3** for styling
- **Zustand 5** for state management
- **Monaco Editor** for code editing
- **Lucide React** for icons
- **react-resizable-panels** for the IDE layout

### Key Components

**Layout:** VS Code-like IDE with resizable panels
- Left: File explorer
- Center: Monaco code editor (with tabs)
- Right: Chat panel
- Bottom: Terminal

**State Management:** Single Zustand store (useSandboxStore) manages everything:
- Session state (current session, list)
- File state (open files, content, dirty flags)
- Chat state (messages, streaming)
- Terminal state (output lines, executing flag)
- Git state (status, branches)

**Auth:** useAuth hook manages login/logout with localStorage JWT.

### Frontend API Client (ui/src/lib/api.ts)

Four API modules:
- authApi -- Login with setup token
- sessionsApi -- Create, list, resume, terminate, exec, execStream
- chatApi -- Send messages, get history, stream responses
- filesApi -- List, read, write, delete, search, diff
- gitApi -- Status, log, diff, stage, commit, push, pull, branches

All use a shared request<T>() helper that injects the JWT from localStorage.

SSE streaming uses async generators:
```typescript
async function* stream(): AsyncGenerator<{ type: string; content?: string }> {
  const reader = response.body.getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    // Parse SSE data lines, yield JSON chunks
  }
}
```

---

## 14. File and Git Operations

### File Operations
All file operations go through the SandboxManager which calls methods on the Sandbox SDK:

| Operation | SDK Method | API Endpoint |
|-----------|-----------|--------------|
| List files | sandbox.listFiles(path) | GET /api/files/list/:id |
| Read file | sandbox.readFile(path) | GET /api/files/read/:id |
| Write file | sandbox.writeFile(path, content) | POST /api/files/write/:id |
| Delete | exec rm | DELETE /api/files/delete/:id |
| Create dir | sandbox.mkdir(path) | POST /api/files/mkdir/:id |
| Move/rename | exec mv | POST /api/files/move/:id |
| Search | exec grep/find | GET /api/files/search/:id |

### Git Operations
Git operations use execInSandbox() to run git commands:

| Operation | Command | API Endpoint |
|-----------|---------|--------------|
| Status | git status --porcelain -b | GET /api/git/status/:id |
| Log | git log --format=... | GET /api/git/log/:id |
| Diff | git diff [--staged] [file] | GET /api/git/diff/:id |
| Stage | git add <files> | POST /api/git/stage/:id |
| Commit | git commit -m "..." | POST /api/git/commit/:id |
| Push | git push [remote] [branch] | POST /api/git/push/:id |
| Pull | git pull [--rebase] | POST /api/git/pull/:id |
| Branches | git branch -a --format=... | GET /api/git/branches/:id |
| Checkout | git checkout [-b] <branch> | POST /api/git/checkout/:id |

---

## 15. Session Lifecycle

```
CREATE                    ACTIVE                    SLEEPING
  |                         |                         |
  | POST /sessions/create   | (auto after 10min idle) |
  |                         |                         |
  v                         v                         v
[creating] --------> [active] <-------> [sleeping]
                        |                    ^
                        |   POST /resume     |
                        |                    |
                        v                    |
                   [terminated] <----- DELETE /sessions/:id
```

### State Storage
- **Session metadata:** KV (session:id) with 7-day TTL
- **Chat messages:** KV (message:sessionId:messageId) with 7-day TTL
- **SDK session ID:** Stored in session metadata for conversation continuity
- **Container state:** Managed by Cloudflare (sleepAfter: 10min)

### Container Sleep/Wake
- Container auto-sleeps after 10 minutes of no activity
- First request to a sleeping container triggers wake (about 2 seconds)
- All filesystem state is preserved across sleep/wake cycles
- Session KV record is updated with status: sleeping or status: active

---

## 16. Hardware and Platform Requirements

### To Run VaporForge (as a user)
- **Any device with a modern browser** -- phone, tablet, laptop, desktop
- A **Claude Pro or Max subscription** (for the OAuth token)
- **Claude Code CLI** installed locally (just to run claude setup-token once)
- That is it. No Node.js, no terminal, no IDE needed on the client device.

### To Develop/Deploy VaporForge
- **macOS or Linux** (Windows with WSL works too)
- **Node.js 20+**
- **Docker Desktop** (for local container builds -- optional, CF builds remotely)
- **Cloudflare account** with:
  - Workers paid plan ($5/month)
  - Containers beta access
  - KV namespace (2 namespaces)
  - R2 bucket (1 bucket)
  - Custom domain (optional)
- **wrangler CLI** (npm install -g wrangler)

### Cloudflare Container Specs
- **OS:** Ubuntu 20.04 (linux/amd64)
- **CPU:** Shared vCPU
- **Memory:** Basic tier (exact specs vary)
- **Instance type:** basic (configurable in wrangler.jsonc)
- **Max instances:** 10 (configurable)
- **Disk:** Ephemeral filesystem preserved across sleep/wake
- **Network:** Full outbound internet access

### Cost Estimate
- Cloudflare Workers: $5/month (paid plan required for Durable Objects)
- Cloudflare KV: Included in paid plan (first 100K reads/day free)
- Cloudflare R2: First 10GB free
- Cloudflare Containers: Beta pricing (check current rates)
- Anthropic API: $0 (uses user's existing subscription via OAuth)

---

## 17. Reproducing This From Scratch

### Prerequisites
```bash
# Install Node.js 20+
# Install wrangler
npm install -g wrangler

# Login to Cloudflare
wrangler login
```

### Step 1: Create the Project
```bash
mkdir vaporforge && cd vaporforge
npm init -y
npm install hono @cloudflare/sandbox @anthropic-ai/sdk zod
npm install -D wrangler typescript @cloudflare/workers-types
```

### Step 2: Create Cloudflare Resources
```bash
# Create KV namespaces
wrangler kv namespace create AUTH_KV
wrangler kv namespace create SESSIONS_KV

# Create R2 bucket
wrangler r2 bucket create vaporforge-files

# Set JWT secret
wrangler secret put JWT_SECRET
# (paste a random string)
```

### Step 3: Configure wrangler.jsonc
```jsonc
{
  "name": "vaporforge",
  "main": "src/index.ts",
  "compatibility_date": "2024-12-01",
  "compatibility_flags": ["nodejs_compat"],
  "containers": [{
    "class_name": "Sandbox",
    "image": "./Dockerfile",
    "instance_type": "basic",
    "max_instances": 10
  }],
  "durable_objects": {
    "bindings": [
      { "name": "SANDBOX_CONTAINER", "class_name": "Sandbox" }
    ]
  },
  "kv_namespaces": [
    { "binding": "AUTH_KV", "id": "<your-id>" },
    { "binding": "SESSIONS_KV", "id": "<your-id>" }
  ],
  "r2_buckets": [
    { "binding": "FILES_BUCKET", "bucket_name": "vaporforge-files" }
  ],
  "vars": { "ENVIRONMENT": "development" },
  "assets": { "directory": "./ui/dist" }
}
```

### Step 4: Create the Dockerfile
See section 12 above. Key points:
- Base: cloudflare/sandbox:0.7.0
- Install claude-code CLI and agent SDK
- Embed claude-agent.js via heredoc (not COPY)
- Set NODE_PATH

### Step 5: Implement the Backend
Create these files:
- src/index.ts -- Worker entry point
- src/router.ts -- Hono routes + auth endpoint
- src/auth.ts -- JWT auth service
- src/sandbox.ts -- SandboxManager wrapper
- src/types.ts -- Zod schemas
- src/api/sessions.ts -- Session CRUD + exec + exec-stream
- src/api/chat.ts -- Chat with SDK streaming
- src/api/files.ts -- File operations
- src/api/git.ts -- Git operations

### Step 6: Create the Frontend
```bash
mkdir ui && cd ui
npm create vite@latest . -- --template react-ts
npm install zustand @monaco-editor/react lucide-react react-resizable-panels
npm install -D tailwindcss postcss autoprefixer
```

### Step 7: Deploy
```bash
# Build UI
cd ui && npm run build && cd ..

# Deploy (builds container image remotely)
npx wrangler deploy
```

### Step 8: Local Development
```bash
# Create .dev.vars for local secrets
echo 'JWT_SECRET=local-dev-secret' > .dev.vars

# Terminal 1: Worker
npm run dev    # wrangler dev on :8787

# Terminal 2: UI
npm run dev:ui # vite on :5173
```

---

## 18. Resources That Cracked the Code

### Official Documentation
- **Cloudflare Containers docs** -- Container SDK API, Dockerfile requirements, sleep/wake behavior
- **Cloudflare Sandbox SDK types** -- @cloudflare/sandbox TypeScript definitions (the best docs)
- **Anthropic Agent SDK docs** -- query() API, session management, streaming events
- **Anthropic Claude Code docs** -- claude setup-token, OAuth token format

### Reference Implementations
- **1Code** (Aventerica89/1code) -- Claude Code wrapper CLI, studied its auth flow
- **claudecodeui** -- Community Claude Code web UI, studied its streaming approach
- **Cloudflare sandbox-sdk examples** -- Official examples for container patterns

### Key Discoveries (Through Trial and Error)
1. claude setup-token outputs a usable OAuth token
2. CLAUDE_CODE_OAUTH_TOKEN env var is how Claude Code CLI finds its token
3. sandbox.execStream() returns ReadableStream with SSE events
4. SDK session_id is snake_case (not camelCase)
5. Dockerfile COPY does not work in CF container builds -- use heredocs
6. NODE_PATH must be passed in exec env, not just Dockerfile ENV
7. wrangler deploy hangs sometimes -- use npx wrangler deploy
8. Local dev needs .dev.vars for Worker secrets
9. Workers CORS must include localhost:5173 for Vite dev server

### Tools Used
- **Claude Code (Opus 4.6)** -- Built the entire project
- **Zed editor** -- Code review and navigation
- **Chrome DevTools** -- Frontend debugging
- **wrangler CLI** -- Deploy, dev, secret management
- **Context7 MCP** -- Up-to-date SDK documentation

---

## 19. The Complete File Map

### Backend (Worker) -- src/

```
src/
  index.ts           (45 lines)   Entry point, WebSocket routing, fetch handler
  router.ts         (145 lines)   Hono app, CORS, auth endpoint, middleware
  auth.ts           (252 lines)   AuthService: JWT, token validation, user management
  sandbox.ts        (295 lines)   SandboxManager: exec, files, git, sleep/wake
  types.ts          (185 lines)   Zod schemas for all data types
  websocket.ts      (236 lines)   WebSocket handler + SessionDurableObject
  container.ts       (63 lines)   Container configuration
  api/
    sessions.ts     (664 lines)   Session CRUD, exec, exec-stream, clone, debug
    chat.ts         (434 lines)   Chat send, history, stream, callClaudeInSandbox
    files.ts        (385 lines)   File CRUD, search, diff, move
    git.ts          (566 lines)   Git status, log, diff, stage, commit, push, pull
```

### Frontend (React SPA) -- ui/src/

```
ui/src/
  hooks/
    useSandbox.ts   (428 lines)   Zustand store: sessions, files, chat, terminal, git
    useAuth.ts       (84 lines)   Auth state, login, logout
    useWebSocket.ts (106 lines)   WebSocket connection management
  lib/
    api.ts          (316 lines)   API client: auth, sessions, chat, files, git
    types.ts         (89 lines)   Frontend TypeScript types
  components/
    Terminal.tsx    (190 lines)   Terminal with auto-wrap and streaming
    (+ other components for editor, file explorer, chat, git panel)
```

### Configuration

```
wrangler.jsonc                    Cloudflare Worker + Container config
Dockerfile                        Container image definition (with embedded script)
worker-configuration.d.ts         Generated TypeScript env types
.dev.vars                         Local dev secrets (gitignored)
package.json                      Worker dependencies
ui/package.json                   Frontend dependencies
```

### Total Lines of Code
About 4,500 lines across 17 key files.

---

## 20. Lessons Learned

### On Architecture
1. **Stateless serverless is wrong for AI agents.** The SDK needs persistent state. Use containers.
2. **The orchestrator pattern works.** Worker handles auth/routing, container handles execution.
3. **SSE is simpler than WebSockets for streaming.** WebSockets need connection management,
   reconnection, heartbeats. SSE is just HTTP with a different content type.

### On Cloudflare
4. **Containers are powerful but under-documented.** Read the TypeScript types. They are the best
   documentation available.
5. **wrangler deploy is sometimes flaky.** Always use npx wrangler deploy for reliability.
6. **.dev.vars is essential for local development.** Worker secrets do not exist locally without it.
7. **Sleep/wake is transparent.** Once configured, you do not have to think about it.

### On Anthropic Auth
8. **OAuth tokens and API keys are different products.** Pro/Max users have OAuth, not API keys.
9. **claude setup-token is the key.** It bridges the gap between subscription and programmatic
   access.
10. **Do not try to validate tokens via API.** Just validate the format and let the SDK handle
    authentication.

### On Claude Agent SDK
11. **SDK must run in a long-lived process.** Workers die after 30 seconds. Containers persist.
12. **resume: sessionId enables conversation memory.** Store the session ID and pass it back.
13. **Parse JSON lines from stdout.** The SDK wrapper pattern (script in container, JSON on stdout)
    is robust and debuggable.
14. **session_id is snake_case.** Not sessionId. This will bite you.

### On Development
15. **Research existing implementations first.** 1Code and claudecodeui saved weeks of guessing.
16. **Heredocs beat COPY in Cloudflare Docker builds.** Just embed the script directly.
17. **NODE_PATH must be in exec env, not just Dockerfile ENV.** Container exec does not inherit
    Dockerfile environment variables.
18. **Ship it broken, fix it live.** Cannot test containers locally on Apple Silicon. Deploy and
    iterate.

### On UX
19. **Auto-prompt wrapping changes everything.** Users do not want to type claude -p "...". They
    want to type naturally.
20. **The terminal IS the product.** The chat panel duplicates what claude.ai already does. The
    terminal, with full filesystem access, git, and CLI, is what is unique.

---

## Final Thought

VaporForge is 4,500 lines of code that solves one problem: getting Claude Code to run in a browser.
The hard parts were not the code. They were understanding Anthropic's auth model, Cloudflare's
container system, and the Claude SDK's execution requirements. Every dead end taught something.
The final architecture is simple because we tried all the complex ones first.

**37 commits. 8 auth attempts. 3 SDK architectures. 1 working product.**

https://vaporforge.jbcloud.app

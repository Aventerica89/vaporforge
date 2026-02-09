# VaporForge

Web-based Claude Code IDE on Cloudflare Sandboxes.

## Features

- Full IDE experience (Monaco Editor, file tree, diff viewer)
- Claude-powered AI assistant with streaming responses
- Terminal access to sandboxed environment
- Git integration
- Session persistence with SDK session continuity
- Mobile-first responsive design (chat-first layout, drawer nav, bottom sheets)
- 1Password integration for automatic secrets management
- PWA support (installable, offline-capable)

## Architecture

```
Browser -> Cloudflare Worker -> Cloudflare Sandbox
                |
         Claude API (via user's Pro/Max token)
```

## Authentication

VaporForge uses your existing Claude Pro/Max subscription. No API keys needed.

1. Run `claude setup-token` in your terminal
2. Copy the token
3. Paste it into VaporForge's login page
4. You're in!

## Development

### Prerequisites

- Node.js 20+
- Cloudflare account with Workers Paid plan

### Setup

1. Clone the repository
```bash
git clone https://github.com/Aventerica89/VaporForge.git
cd VaporForge
```

2. Install dependencies
```bash
npm install
cd ui && npm install && cd ..
```

3. Configure secrets
```bash
npx wrangler secret put JWT_SECRET
npx wrangler secret put OP_SERVICE_ACCOUNT_TOKEN
```

4. Create KV namespaces and R2 bucket
```bash
wrangler kv:namespace create AUTH_KV
wrangler kv:namespace create SESSIONS_KV
wrangler r2 bucket create vaporforge-files
```

5. Update wrangler.jsonc with your KV IDs

### Run locally

```bash
# Start worker
npm run dev

# Start UI (in another terminal)
npm run dev:ui
```

### Deploy

```bash
npm run deploy
```

## Project Structure

```
vaporforge/
|-- src/                  # Worker code
|   |-- index.ts          # Main entry
|   |-- router.ts         # API routes
|   |-- sandbox.ts        # Sandbox management
|   |-- auth.ts           # Authentication
|   |-- websocket.ts      # Real-time updates
|   |-- api/              # API endpoints
|-- ui/                   # React frontend
|   |-- src/
|       |-- components/   # UI components
|       |-- hooks/        # Custom hooks
|       |-- lib/          # Utilities
|-- skills/               # Bundled plugins
|-- Dockerfile            # Custom sandbox image
```

## API Endpoints

### Authentication
- `POST /api/auth/setup` - Authenticate with setup token

### Sessions
- `GET /api/sessions/list` - List user sessions
- `POST /api/sessions/create` - Create new session
- `POST /api/sessions/:id/resume` - Resume session
- `DELETE /api/sessions/:id` - Terminate session

### Chat
- `POST /api/chat/send` - Send message
- `POST /api/chat/stream` - Stream response
- `GET /api/chat/history/:sessionId` - Get history

### Files
- `GET /api/files/list/:sessionId` - List files
- `GET /api/files/read/:sessionId` - Read file
- `POST /api/files/write/:sessionId` - Write file

### Git
- `GET /api/git/status/:sessionId` - Get status
- `POST /api/git/commit/:sessionId` - Create commit
- `POST /api/git/push/:sessionId` - Push changes

## Secrets Management

VaporForge uses **1Password service accounts** so sandbox Claude can access secrets at runtime without manual configuration.

### How it works

```
1Password (App Dev vault) --> op CLI in container --> process.env
```

The `OP_SERVICE_ACCOUNT_TOKEN` Worker secret gives every sandbox session read access to the **App Dev** vault. Sandbox Claude can fetch any secret on demand:

```bash
op read "op://App Dev/SECRET_NAME/credential"
```

### Adding a new secret

1. Add the secret to the **App Dev** vault in 1Password (from any device)
2. That's it. Sandbox Claude can read it immediately.

No redeployment, no code changes, no terminal access needed.

### Fallback: Worker secrets

Project secrets can also be forwarded directly as env vars via `npx wrangler secret put`. These are defined in `src/sandbox.ts` (`PROJECT_SECRET_KEYS`) and forwarded to every sandbox session automatically.

### Security

- Service account has **read-only** access to the **App Dev** vault only
- No access to Personal, Business, or Work vaults
- The `OP_SERVICE_ACCOUNT_TOKEN` is stored as a Cloudflare Worker secret (encrypted at rest)
- Secrets are passed to containers via env vars (not persisted to disk)

## Cost Estimate

| Component | Cost |
|-----------|------|
| Workers Paid | $15/month base |
| Sandbox compute | ~$5-20/month |
| **Total** | **$20-35/month** |

## License

MIT

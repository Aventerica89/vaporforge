# VaporForge

Web-based Claude Code IDE on Cloudflare Sandboxes.

## Features

- Full IDE experience (Monaco Editor, file tree, diff viewer)
- Claude-powered AI assistant
- Terminal access to sandboxed environment
- Git integration
- Session persistence
- Mobile-responsive design

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
git clone https://github.com/Aventerica89/vaporforge.git
cd vaporforge
```

2. Install dependencies
```bash
npm install
cd ui && npm install && cd ..
```

3. Configure secrets
```bash
wrangler secret put JWT_SECRET
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

## Cost Estimate

| Component | Cost |
|-----------|------|
| Workers Paid | $15/month base |
| Sandbox compute | ~$5-20/month |
| **Total** | **$20-35/month** |

## License

MIT

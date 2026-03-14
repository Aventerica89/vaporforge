---
name: hono
description: Official Hono framework documentation. Reference when working with Hono routes, middleware, context (c), error handling, validators, or any src/api/*.ts files in VaporForge.
user-invocable: false
---

## VaporForge-Specific Context

VaporForge uses Hono as the web framework for the Cloudflare Worker. Every API route file uses Hono:
- `src/api/*.ts` — 33+ route files, all using Hono
- `src/index.ts` — Main app, mounts all route handlers
- Hono runs inside a CF Worker (no Node.js APIs available)

## API Quick Reference

Core Hono patterns used in VF:

**App setup:**
```typescript
import { Hono } from 'hono'
const app = new Hono<{ Bindings: Env }>()
```

**Route definition:**
```typescript
app.get('/path', async (c) => {
  const env = c.env  // CF bindings (KV, DO, R2, etc.)
  return c.json({ ok: true })
})

app.post('/path', async (c) => {
  const body = await c.req.json()
  return c.json(result, 200)
})
```

**Context object (c) — key properties:**
- `c.env` — Cloudflare bindings (KV, DO stubs, R2, etc.)
- `c.req` — HonoRequest (wraps native Request)
- `c.req.json()` — Parse JSON body
- `c.req.text()` — Get raw body as text
- `c.req.header(name)` — Get a request header
- `c.req.param(name)` — Get a URL path param
- `c.req.query(name)` — Get a query string param
- `c.json(data, status?)` — Return JSON response
- `c.text(text, status?)` — Return text response
- `c.html(html, status?)` — Return HTML response
- `c.body(body, status?, headers?)` — Return raw response
- `c.stream(cb)` — Return a streaming response
- `c.redirect(url, status?)` — Redirect
- `c.set(key, val)` / `c.get(key)` — Request-scoped variables

**Middleware:**
```typescript
app.use('*', async (c, next) => {
  // Before handler
  await next()
  // After handler
})

// Route-specific middleware
app.use('/api/*', authMiddleware)
```

**Error handling:**
```typescript
app.onError((err, c) => {
  return c.json({ error: err.message }, 500)
})

app.notFound((c) => {
  return c.json({ error: 'Not Found' }, 404)
})
```

**Sub-app mounting:**
```typescript
const api = new Hono()
app.route('/api', api)
```

**Streaming response (for SSE/AI streaming):**
```typescript
return c.stream(async (stream) => {
  await stream.write('data: ...\n\n')
})

// Or using streamText for text streaming:
import { streamText } from 'hono/streaming'
return streamText(c, async (stream) => {
  await stream.write('chunk')
})
```

## Critical Gotchas (VF-Specific)

1. **c.env vs process.env** — In CF Workers, environment variables and bindings come from `c.env`, not `process.env`. `process.env` is undefined. Always use `c.env.MY_BINDING` or `c.env.MY_VAR`.

2. **Request body can only be read once** — `c.req.json()`, `c.req.text()`, `c.req.arrayBuffer()` consume the body. Cache the result if needed multiple times: `const body = await c.req.json()`.

3. **Streaming responses and CF sub-request limits** — CF Workers have a 50 sub-request limit per invocation. If a route makes many fetch() calls, it can hit this limit. Long-running streaming responses don't count against sub-request limits but must complete before the Worker context expires.

4. **Route order matters** — Hono matches routes in registration order. More specific routes should be registered before wildcard routes.

5. **TypeScript bindings** — Always type the app with `Hono<{ Bindings: Env }>` where `Env` is the wrangler-generated type. Otherwise `c.env` is untyped and you lose autocomplete on KV/DO/R2 bindings.

6. **Middleware execution order** — `app.use()` middleware runs before route handlers. For auth middleware, mount it with `app.use('/protected/*', authMiddleware)` to only protect specific paths.

## Full Documentation

See `references/docs.md` for the complete Hono documentation.

Source: fetched from `https://hono.dev/llms-full.txt`

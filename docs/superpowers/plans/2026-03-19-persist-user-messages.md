# Persist User Messages in V1.5 Chat — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix user messages disappearing from chat history on page reload by adding KV persistence to the V1.5 streaming paths.

**Architecture:** The V1.5 paths (`POST /api/v15/chat` and WS `/api/v15/ws`) forward prompts to the ChatSessionAgent DO without writing to SESSIONS_KV. All other chat paths already persist user messages using `message:{sessionId}:{uuid}` keys with 7-day TTL. The fix adds the same KV write pattern to the two missing paths. No frontend changes needed — history loading and rendering already handle both roles.

**Tech Stack:** Cloudflare Workers (KV), Durable Objects, TypeScript

---

## Context for Implementer

### Root Cause
- `src/index.ts` lines 88-140 (V1.5 HTTP) and lines 194-239 (V1.5 WS) forward to the DO without persisting user messages
- The DO's `webSocketMessage` handler receives WS prompts but never writes them to KV
- Old paths in `src/api/chat.ts:50-63`, `src/api/chat.ts:202-216`, and `src/api/sdk.ts:84-97` all persist correctly

### Existing Pattern (copy this exactly)
From `src/api/sdk.ts:84-97`:
```typescript
const userMessageId = crypto.randomUUID();
const userMessage: Message = {
  id: userMessageId,
  sessionId,
  role: 'user',
  content: prompt,
  timestamp: new Date().toISOString(),
};
await c.env.SESSIONS_KV.put(
  `message:${sessionId}:${userMessageId}`,
  JSON.stringify(userMessage),
  { expirationTtl: 7 * 24 * 60 * 60 }
);
```

### Key CF Workers Detail
In the Worker fetch handler, use `ctx.waitUntil()` for fire-and-forget KV writes — the runtime may terminate the isolate after returning the Response. In the DO, fire-and-forget with `.catch(() => {})` is safe because the `webSocketMessage` handler keeps the DO alive.

### Files to Modify
| File | Change |
|------|--------|
| `src/index.ts:~119` | Add KV write before `stub.fetch()` in V1.5 HTTP path |
| `src/agents/chat-session-agent.ts` | Add KV write in `webSocketMessage` when receiving `type: 'chat'` |

### No Changes Needed
- Frontend history loading (`ui/src/hooks/useSandbox.ts:293-304`) — already loads all roles
- Backend history endpoint (`src/api/chat.ts:128-151`) — already returns all roles
- Message rendering (`ui/src/components/chat/MessageList.tsx`) — already renders user bubbles
- Message type (`Message` interface) — already has `role: 'user' | 'assistant'`

---

## Task 1: Add user message persistence to V1.5 HTTP path

**Files:**
- Modify: `src/index.ts:~119` (before `stub.fetch()` call)

- [ ] **Step 1: Read `src/index.ts` lines 88-140**

Understand the V1.5 HTTP handler. Note: `body.sessionId` and `body.prompt` are already validated. `env.SESSIONS_KV` is available. The execution context is accessed via the raw Worker `ctx` parameter (not Hono's `c.executionCtx`).

- [ ] **Step 2: Add user message KV write**

Insert before the `try {` block at ~line 120 (after session ownership check, before DO stub call):

```typescript
// Persist user message to KV so chat history survives refresh
const userMsgId = crypto.randomUUID();
ctx.waitUntil(env.SESSIONS_KV.put(
  `message:${body.sessionId}:${userMsgId}`,
  JSON.stringify({
    id: userMsgId,
    sessionId: body.sessionId,
    role: 'user',
    content: body.prompt,
    timestamp: new Date().toISOString(),
  }),
  { expirationTtl: 7 * 24 * 60 * 60 }
));
```

Note: Check the Worker fetch handler signature to confirm `ctx` is available. If the handler uses `{ request, env, ctx }` destructuring, `ctx.waitUntil()` works. If not, find the execution context variable name.

- [ ] **Step 3: Verify build**

```bash
npm run build
```
Expected: Build succeeds with no type errors.

- [ ] **Step 4: Commit**

```bash
git add src/index.ts
git commit -m "fix: persist user messages in V1.5 HTTP chat path"
```

---

## Task 2: Add user message persistence to V1.5 WS path (DO)

**Files:**
- Modify: `src/agents/chat-session-agent.ts` (in `webSocketMessage` handler)

- [ ] **Step 1: Find the webSocketMessage handler**

Search for where `type: 'chat'` messages are parsed in the DO. The prompt text and sessionId are extracted there.

```bash
grep -n "type.*chat\|webSocketMessage" src/agents/chat-session-agent.ts | head -20
```

- [ ] **Step 2: Read the handler section**

Read ~30 lines around the chat message parsing to understand where `prompt` and `sessionId` are available.

- [ ] **Step 3: Add user message KV write**

After parsing the chat message (where `prompt` is extracted), before `dispatchContainer()`:

```typescript
// Persist user message to KV so chat history survives refresh
const userMsgId = crypto.randomUUID();
this.env.SESSIONS_KV.put(
  `message:${sessionId}:${userMsgId}`,
  JSON.stringify({
    id: userMsgId,
    sessionId,
    role: 'user',
    content: prompt,
    timestamp: new Date().toISOString(),
  }),
  { expirationTtl: 7 * 24 * 60 * 60 }
).catch(() => {});
```

Note: In the DO, `.catch(() => {})` is safe — the DO stays alive during `webSocketMessage`. Do NOT use `this.state.waitUntil()` here (that's for keeping the DO alive after the handler returns for async work like stream consumption).

- [ ] **Step 4: Verify build**

```bash
npm run build
```
Expected: Build succeeds.

- [ ] **Step 5: Commit**

```bash
git add src/agents/chat-session-agent.ts
git commit -m "fix: persist user messages in V1.5 WS chat path (DO)"
```

---

## Task 3: Deploy and test

- [ ] **Step 1: Deploy**

```bash
npx wrangler deploy
```

- [ ] **Step 2: Test HTTP path**

1. Open VaporForge in browser
2. Send a message (ensure WS streaming is OFF in DevTools to test HTTP path)
3. Reload the page
4. Verify user message appears in chat history

- [ ] **Step 3: Test WS path**

1. Ensure WS streaming is ON in DevTools (default)
2. Send a message
3. Reload the page
4. Verify user message appears in chat history

- [ ] **Step 4: Test multiple messages**

1. Send 3+ messages in a conversation
2. Reload
3. Verify all user messages appear interleaved with assistant responses in correct order

- [ ] **Step 5: Commit and push**

```bash
git push -u origin feat/persist-user-messages
```

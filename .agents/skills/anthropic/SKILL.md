---
name: anthropic
description: This skill should be used when working with OAuth token handling, Claude SDK integration, @anthropic-ai/sdk, API calls from a Cloudflare Worker, createClient() auth detection, or the Anthropic Messages API in VaporForge.
user-invocable: false
---

# Claude API Reference

> Anthropic — AI research company developing safe and reliable AI systems.
> Source: https://platform.claude.com/docs
> Installed: manually (docs.anthropic.com/llms.txt is currently 404)

## Models

| Model | ID | Context | Max Output |
|-------|----|---------|-----------|
| Claude Opus 4.6 | `claude-opus-4-6` | 200K / 1M (beta) | 128K |
| Claude Sonnet 4.6 | `claude-sonnet-4-6` | 200K / 1M (beta) | 64K |
| Claude Haiku 4.5 | `claude-haiku-4-5-20251001` | 200K | 64K |

Legacy: `claude-opus-4-5`, `claude-sonnet-4-5`, `claude-opus-4`, `claude-sonnet-4`, `claude-haiku-3` (retiring Apr 19 2026).

## Authentication

```
x-api-key: YOUR_API_KEY          (required)
anthropic-version: 2023-06-01    (required)
content-type: application/json   (required)
```

SDK: `ANTHROPIC_API_KEY` env var handled automatically.

OAuth tokens (`sk-ant-oat01-*`) work with `@anthropic-ai/sdk` Node.js via `authToken`. Do NOT use with `@ai-sdk/anthropic` in Cloudflare Workers — requires explicit API key (`sk-ant-api01-*`).

## Messages API

`POST https://api.anthropic.com/v1/messages`

```json
{
  "model": "claude-opus-4-6",
  "max_tokens": 1024,
  "system": "You are helpful.",
  "messages": [
    { "role": "user", "content": "Hello" }
  ]
}
```

Key params: `model`, `max_tokens` (required), `messages`, `system`, `temperature` (0-1), `tools`, `tool_choice`, `stream`, `thinking`, `stop_sequences`.

Content block types: `text`, `image` (base64/url/file), `document` (PDF), `tool_use`, `tool_result`.

## Streaming

```json
{ "stream": true }
```

SSE events: `message_start`, `content_block_start`, `content_block_delta` (text_delta / input_json_delta), `content_block_stop`, `message_delta`, `message_stop`.

```typescript
client.messages.stream({ model: "claude-opus-4-6", max_tokens: 1024, messages: [...] })
  .on("text", (text) => process.stdout.write(text));
```

## Tool Use

```json
{
  "tools": [{
    "name": "get_weather",
    "description": "Get current weather",
    "input_schema": {
      "type": "object",
      "properties": { "location": { "type": "string" } },
      "required": ["location"]
    }
  }],
  "tool_choice": "auto"
}
```

Flow: Claude returns `tool_use` block → you execute → send back `tool_result` with `tool_use_id`.

Add `"strict": true` to guarantee schema conformance.

## Vision

Formats: JPEG, PNG, GIF, WebP. Max 8000×8000px, 5MB, 100 images/request.
Token cost: `(width × height) / 750`. Place images before text in prompts.

## Prompt Caching

```json
{ "cache_control": { "type": "ephemeral" } }
```

Min tokens: 4096 (Opus/Haiku 4.5), 2048 (Sonnet 4.6). Default TTL: 5 min. Extended: `{"type":"ephemeral","ttl":"1h"}` (2× input price).

Pricing vs base input: Cache write 1.25×, Cache read 0.1× (90% savings).

Response tracking: `cache_creation_input_tokens`, `cache_read_input_tokens` in `usage`.

## Extended Thinking

```json
{ "thinking": { "type": "enabled", "budget_tokens": 10000 } }
```

Supported: Opus 4.6, Sonnet 4.6, Haiku 4.5. Returns `thinking` content block.

## Structured Output

```json
{
  "output_config": {
    "type": "json_schema",
    "schema": { "type": "object", "properties": { "answer": { "type": "string" } }, "required": ["answer"] }
  }
}
```

## Token Counting

`POST https://api.anthropic.com/v1/messages/count_tokens` — returns `{ "input_tokens": N }`.

## Batch API

`POST https://api.anthropic.com/v1/messages/batches` — 50% cost reduction, async processing.

## Files API (Beta)

`POST https://api.anthropic.com/v1/files` — upload once, reference by `file_id` across requests.

## Pricing

| Model | Input | Output | Cache Read |
|-------|-------|--------|-----------|
| Opus 4.6 | $5/MTok | $25/MTok | $0.50/MTok |
| Sonnet 4.6 | $3/MTok | $15/MTok | $0.30/MTok |
| Haiku 4.5 | $1/MTok | $5/MTok | $0.10/MTok |

## Error Codes

`400` Invalid params · `401` Bad API key · `429` Rate limit · `500` Server error

## SDKs

- Python: `pip install anthropic`
- TypeScript: `npm install @anthropic-ai/sdk`
- Go: `go get github.com/anthropics/anthropic-sdk-go`

## Links

- Docs: https://platform.claude.com/docs
- Console: https://platform.claude.com
- Cookbooks: https://platform.claude.com/cookbook

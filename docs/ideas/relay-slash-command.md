**Added:** 2026-03-13
**Status:** Idea
**Category:** VaporForge / Features / Multi-Model

## Summary

A `/relay` slash command inside VaporForge chat sessions that routes the current problem to other AI models and streams back their response. Two modes: single-model relay (e.g. Gemini with search grounding) or full multi-model relay (all configured providers respond simultaneously).

## Modes

### `/relay` — Single relay (Gemini + search)
- Sends current conversation context + last user message to Gemini
- Uses Gemini's grounding/search capability to pull in live web results
- Streams response back into the session as a special "Relay Response" message block
- Useful when Claude gets stuck or needs current info Claude's training doesn't have

### `/relay all` — Full council relay
- Sends to all configured providers simultaneously (Gemini, GPT-4o, etc.)
- Each model's response streams in parallel as labeled blocks
- User can compare approaches, pick the best one, or forward a response back to Claude

## Implementation Sketch

1. **Slash command registration** — add `/relay` to VaporForge's command system (same pattern as existing slash commands)
2. **Context capture** — grab last N messages from current session as context
3. **Relay dispatch** — Worker uses AI SDK `streamText` with selected provider(s)
4. **Response injection** — stream relay response back via existing WS tunnel as a special frame type (e.g. `relay-delta`, `relay-complete` with `provider` field)
5. **UI rendering** — `MessageContent.tsx` renders relay blocks with provider label badge

## Why Useful

- Claude gets stuck on a hard problem → ask Gemini with live search
- Architecture decision → get multiple model opinions instantly
- Debugging — Gemini's code analysis vs Claude's vs GPT's
- Current events / recent docs Claude doesn't know → Gemini grounding fills the gap

## Related

- `docs/ideas/relay-streaming-prompt.md` — original AHA moment design doc for streaming relay architecture
- Worker already has Gemini/multi-model AI SDK integration (QuickChat, Transform)
- Provider key management already exists per-user in AUTH_KV

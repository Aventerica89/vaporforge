#!/usr/bin/env node

// Node.js script that runs INSIDE the Cloudflare Sandbox container
// Maintains Claude Agent SDK instance and handles streaming responses
// This is the correct architecture per Anthropic's Agent SDK hosting docs
//
// Output protocol (JSON lines on stdout):
//   { type: "session-init", sessionId: "..." }
//   { type: "text-delta", text: "..." }
//   { type: "done", sessionId: "...", fullText: "..." }
//   { type: "error", error: "..." }

const { query } = require('@anthropic-ai/claude-agent-sdk');

async function handleQuery(prompt, sessionId, cwd) {
  // Build options object matching the real SDK API
  const options = {
    model: 'claude-sonnet-4-5',
    cwd: cwd || '/workspace',
    includePartialMessages: true,
    ...(sessionId ? { resume: sessionId } : {}),
  };

  const stream = query({ prompt, options });

  let newSessionId = sessionId || '';
  let responseText = '';

  for await (const msg of stream) {
    // Session ID from system init event (snake_case per SDK)
    if (msg.type === 'system' && msg.subtype === 'init' && msg.session_id) {
      newSessionId = msg.session_id;
      console.log(JSON.stringify({ type: 'session-init', sessionId: newSessionId }));
    }

    // Streaming text deltas (requires includePartialMessages: true)
    if (msg.type === 'stream_event') {
      const event = msg.event;
      if (event && event.type === 'content_block_delta' && event.delta && event.delta.type === 'text_delta') {
        responseText += event.delta.text;
        console.log(JSON.stringify({ type: 'text-delta', text: event.delta.text }));
      }
    }

    // Complete assistant message (always emitted, overrides streamed text)
    if (msg.type === 'assistant' && msg.message && msg.message.content) {
      responseText = msg.message.content
        .filter(b => b.type === 'text')
        .map(b => b.text)
        .join('');
    }

    // Result message with final session_id
    if (msg.type === 'result' && msg.session_id) {
      newSessionId = msg.session_id;
    }

    // Handle errors from SDK
    if (msg.type === 'error') {
      const errorMsg = msg.error || msg.errorText || 'Unknown SDK error';
      console.error(JSON.stringify({ type: 'error', error: errorMsg }));
      process.exit(1);
    }
  }

  // Final message with complete response
  console.log(JSON.stringify({
    type: 'done',
    sessionId: newSessionId,
    fullText: responseText,
  }));
}

// Read arguments from command line
const args = process.argv.slice(2);
if (args.length < 1) {
  console.error(JSON.stringify({
    type: 'error',
    error: 'Usage: node claude-agent.js <prompt> [sessionId] [cwd]'
  }));
  process.exit(1);
}

const [prompt, sessionId, cwd] = args;
handleQuery(prompt, sessionId, cwd).catch(err => {
  console.error(JSON.stringify({
    type: 'error',
    error: err.message || 'Unknown error'
  }));
  process.exit(1);
});

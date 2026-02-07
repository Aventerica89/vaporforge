#!/usr/bin/env node

// Node.js script that runs INSIDE the Cloudflare Sandbox container
// Maintains Claude Agent SDK instance and handles streaming responses
// This is the correct architecture per Anthropic's Agent SDK hosting docs

const { query } = require('@anthropic-ai/claude-agent-sdk');

async function handleQuery(prompt, sessionId, cwd) {
  const queryOptions = {
    prompt,
    cwd: cwd || '/workspace',
    model: 'claude-sonnet-4-5',
    // Resume existing session or start new one
    ...(sessionId ? { resume: sessionId, continue: true } : { continue: true }),
  };

  const stream = query(queryOptions);

  let newSessionId = sessionId;
  let responseText = '';

  for await (const msg of stream) {
    // Extract session ID from session-init event
    if (msg.type === 'session-init' && msg.sessionId) {
      newSessionId = msg.sessionId;
      console.log(JSON.stringify({ type: 'session-init', sessionId: newSessionId }));
    }

    // Stream text deltas for real-time responses
    if (msg.event?.type === 'content_block_delta') {
      const delta = msg.event.delta;
      if (delta?.type === 'text_delta' && delta.text) {
        responseText += delta.text;
        console.log(JSON.stringify({ type: 'text-delta', text: delta.text }));
      }
    }

    // Handle errors from SDK
    if (msg.type === 'error') {
      console.error(JSON.stringify({ type: 'error', error: msg.errorText }));
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

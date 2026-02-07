# VaporForge Sandbox - Cloudflare Container
# Based on official cloudflare/sandbox-sdk/examples/claude-code pattern
FROM docker.io/cloudflare/sandbox:0.7.0

# Install Claude Code CLI (required by Agent SDK)
RUN npm install -g @anthropic-ai/claude-code

# Install Agent SDK locally in /workspace so Node's require() finds it
# Also install globally as fallback and set NODE_PATH
RUN npm install -g @anthropic-ai/claude-agent-sdk@latest && \
    cd /workspace && npm init -y && npm install @anthropic-ai/claude-agent-sdk@latest
ENV NODE_PATH=/usr/local/lib/node_modules

# Install essential dev tools (keep minimal to avoid disk/build issues)
RUN apt-get update && apt-get install -y \
    git \
    curl \
    jq \
    && rm -rf /var/lib/apt/lists/*

# Increase command timeout for AI responses (5 min)
ENV COMMAND_TIMEOUT_MS=300000

# Create workspace directory
RUN mkdir -p /workspace

# Embed SDK wrapper script directly (avoids COPY build context issues)
# IMPORTANT: Keep in sync with src/sandbox-scripts/claude-agent.js
RUN cat > /workspace/claude-agent.js << 'CLAUDE_AGENT_EOF'
#!/usr/bin/env node

// Node.js script that runs INSIDE the Cloudflare Sandbox container
// Maintains Claude Agent SDK instance and handles streaming responses
// This is the correct architecture per Anthropic's Agent SDK hosting docs
//
// Output protocol (JSON lines on stdout):
//   { type: "session-init", sessionId: "..." }
//   { type: "text-delta", text: "..." }
//   { type: "tool-start", name: "...", input: {...} }
//   { type: "tool-result", name: "...", output: "..." }
//   { type: "done", sessionId: "...", fullText: "..." }
//   { type: "error", error: "..." }

let query;
try {
  query = require('@anthropic-ai/claude-agent-sdk').query;
} catch (e) {
  console.error(JSON.stringify({
    type: 'error',
    error: `SDK import failed: ${e.message}`,
  }));
  process.exit(1);
}

async function handleQuery(prompt, sessionId, cwd) {
  // Build options object matching the real SDK API (follows 1code pattern)
  const oauthToken = process.env.CLAUDE_CODE_OAUTH_TOKEN || '';
  const options = {
    model: 'claude-sonnet-4-5',
    cwd: cwd || '/workspace',
    includePartialMessages: true,
    permissionMode: 'bypassPermissions',
    allowDangerouslySkipPermissions: true,
    continue: true,
    systemPrompt: 'You are working in a cloud sandbox. Always create, edit, and manage files in /workspace (your cwd). Never use /tmp unless explicitly asked.',
    env: {
      ...process.env,
      ...(oauthToken ? { CLAUDE_CODE_OAUTH_TOKEN: oauthToken } : {}),
      NODE_PATH: process.env.NODE_PATH || '/usr/local/lib/node_modules',
      PATH: process.env.PATH || '/usr/local/bin:/usr/bin:/bin',
      IS_SANDBOX: '1',
    },
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

    // Tool use events - forward tool invocations for UI display
    if (msg.type === 'assistant' && msg.message && msg.message.content) {
      for (const block of msg.message.content) {
        if (block.type === 'tool_use') {
          console.log(JSON.stringify({
            type: 'tool-start',
            name: block.name || 'unknown',
            input: block.input || {},
          }));
        }
      }
      // Also capture final text from assistant message
      responseText = msg.message.content
        .filter(b => b.type === 'text')
        .map(b => b.text)
        .join('');
    }

    // Tool result events
    if (msg.type === 'tool_result' || (msg.type === 'stream_event' && msg.event && msg.event.type === 'tool_result')) {
      const toolEvent = msg.type === 'tool_result' ? msg : msg.event;
      console.log(JSON.stringify({
        type: 'tool-result',
        name: toolEvent.name || toolEvent.tool_name || 'unknown',
        output: typeof toolEvent.output === 'string'
          ? toolEvent.output.slice(0, 500)
          : JSON.stringify(toolEvent.output || toolEvent.content || '').slice(0, 500),
      }));
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
  const errorDetail = err.stack || err.message || String(err);
  console.error(JSON.stringify({
    type: 'error',
    error: errorDetail.slice(0, 1000),
  }));
  process.exit(1);
});
CLAUDE_AGENT_EOF

RUN chmod +x /workspace/claude-agent.js

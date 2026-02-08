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

// Extract a user-friendly error message from SDK errors
function cleanErrorMessage(err) {
  const raw = err.stack || err.message || String(err);
  // "Claude Code process exited with code N at XX.getProcessExitError ..."
  const exitMatch = raw.match(/process exited with code (\d+)/i);
  if (exitMatch) {
    return `Claude Code process crashed (exit code ${exitMatch[1]}). This usually means the session state is stale or the sandbox restarted.`;
  }
  // Strip file paths and stack frames for cleaner messages
  const firstLine = raw.split('\n')[0].trim();
  return firstLine.length > 200 ? firstLine.slice(0, 200) + '...' : firstLine;
}

function buildOptions(prompt, sessionId, cwd, useResume) {
  const oauthToken = process.env.CLAUDE_CODE_OAUTH_TOKEN || '';
  return {
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
    ...(useResume && sessionId ? { resume: sessionId } : {}),
  };
}

async function runStream(prompt, sessionId, cwd, useResume) {
  const options = buildOptions(prompt, sessionId, cwd, useResume);
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

    // Handle errors from SDK — report but don't exit
    // process.exit(1) here kills the RPC stream, causing
    // "ReadableStream received over RPC disconnected prematurely"
    if (msg.type === 'error') {
      const errorMsg = msg.error || msg.errorText || 'Unknown SDK error';
      console.log(JSON.stringify({ type: 'error', error: errorMsg }));
      // Let the for-await loop complete — 'done' will be sent at the end
    }
  }

  return { newSessionId, responseText };
}

async function handleQuery(prompt, sessionId, cwd) {
  let result;

  try {
    // First attempt: resume existing session if we have a sessionId
    result = await runStream(prompt, sessionId, cwd, !!sessionId);
  } catch (err) {
    const friendly = cleanErrorMessage(err);

    // If we were trying to resume a session and it crashed, retry fresh
    if (sessionId) {
      console.log(JSON.stringify({
        type: 'error',
        error: `Session resume failed: ${friendly}. Starting fresh session...`,
      }));
      // Signal to backend that the old sdkSessionId is invalid
      console.log(JSON.stringify({ type: 'session-reset' }));

      try {
        result = await runStream(prompt, '', cwd, false);
      } catch (retryErr) {
        const retryMsg = cleanErrorMessage(retryErr);
        console.log(JSON.stringify({ type: 'error', error: retryMsg }));
        console.log(JSON.stringify({ type: 'done', sessionId: '', fullText: '' }));
        return;
      }
    } else {
      // No session to retry without — report the error
      console.log(JSON.stringify({ type: 'error', error: friendly }));
      console.log(JSON.stringify({ type: 'done', sessionId: '', fullText: '' }));
      return;
    }
  }

  // Final message with complete response
  console.log(JSON.stringify({
    type: 'done',
    sessionId: result.newSessionId,
    fullText: result.responseText,
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
  // Output clean error to stdout (parsed by backend) — avoid raw stack traces
  const friendly = cleanErrorMessage(err);
  console.log(JSON.stringify({ type: 'error', error: friendly }));
  console.log(JSON.stringify({ type: 'done', sessionId: '', fullText: '' }));
  // Log full detail to stderr for server-side debugging only
  console.error(`[claude-agent] fatal: ${err.stack || err.message || err}`);
  // Exit cleanly (code 0) — errors are already reported via stdout protocol.
  // Using exit(1) causes the backend to emit a redundant "process exited with code 1" error.
  process.exit(0);
});

#!/usr/bin/env node

// WebSocket agent server for VaporForge containers.
// Listens on port 8765, receives queries via context files,
// spawns claude-agent.js, and pipes stdout lines as WS frames.
//
// Lifecycle: Started once per container wake. Handles sequential queries.
// Protocol: Worker writes context to /tmp/vf-pending-query.json via
// sandbox.writeFile(), then proxies the browser WS via wsConnect(8765).

const { WebSocketServer } = require('ws');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const PORT = 8765;
const CONTEXT_FILE = '/tmp/vf-pending-query.json';
const AGENT_SCRIPT = '/opt/claude-agent/claude-agent.js';

const wss = new WebSocketServer({ port: PORT });
let activeChild = null;

console.log(`[ws-agent-server] listening on port ${PORT}`);

// Run context-gathering script ONCE at startup (not per-connection).
// Caches output to /tmp/vf-auto-context.md for claude-agent.js to read.
const CONTEXT_SCRIPT = '/opt/claude-agent/gather-context.sh';
const AUTO_CONTEXT_FILE = '/tmp/vf-auto-context.md';

try {
  const { execFileSync } = require('child_process');
  if (fs.existsSync(CONTEXT_SCRIPT)) {
    const output = execFileSync('bash', [CONTEXT_SCRIPT], {
      cwd: '/workspace',
      timeout: 10000,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    if (output && output.trim()) {
      fs.writeFileSync(AUTO_CONTEXT_FILE, output.trim());
      console.log(`[ws-agent-server] auto-context gathered (${output.trim().length} chars)`);
    }
  }
} catch (err) {
  // Non-fatal — auto-context is best-effort
  console.log(`[ws-agent-server] auto-context gathering skipped: ${err.message || err}`);
}

wss.on('connection', (ws) => {
  console.log('[ws-agent-server] client connected');

  // Kill any lingering child from a previous aborted connection
  if (activeChild) {
    try { activeChild.kill('SIGTERM'); } catch {}
    activeChild = null;
  }

  // Poll for context file (50ms intervals, 3s max) instead of hardcoded 150ms wait
  const POLL_INTERVAL = 50;
  const POLL_MAX = 3000;
  let elapsed = 0;
  const pollTimer = setInterval(() => {
    elapsed += POLL_INTERVAL;
    if (fs.existsSync(CONTEXT_FILE)) {
      clearInterval(pollTimer);
      startQuery(ws);
    } else if (elapsed >= POLL_MAX) {
      clearInterval(pollTimer);
      console.log('[ws-agent-server] context file not found after 3s');
      sendJson(ws, { type: 'error', error: 'Context file timeout' });
      sendJson(ws, { type: 'process-exit', exitCode: 1 });
      ws.close();
    }
  }, POLL_INTERVAL);
});

function startQuery(ws) {
  // Read context file written by the Worker
  let context;
  try {
    const raw = fs.readFileSync(CONTEXT_FILE, 'utf8');
    context = JSON.parse(raw);
  } catch (err) {
    sendJson(ws, { type: 'error', error: `Failed to read context: ${err.message}` });
    sendJson(ws, { type: 'process-exit', exitCode: 1 });
    ws.close();
    return;
  }

  // Delete context file immediately (contains secrets)
  try { fs.unlinkSync(CONTEXT_FILE); } catch {}

  const { prompt, sessionId, cwd, env: extraEnv, mode } = context;

  // Stream replay: buffer every chunk to JSONL so client can reconnect
  const msgId = (extraEnv && extraEnv.VF_MSG_ID) || '';
  const bufferPath = msgId ? `/tmp/vf-stream-${msgId}.jsonl` : '';
  // Flag set to true when client disconnects before agent finishes.
  // Prevents buffer deletion on close so the replay endpoint can serve it.
  let clientDisconnectedEarly = false;

  if (!prompt) {
    sendJson(ws, { type: 'error', error: 'No prompt in context file' });
    sendJson(ws, { type: 'process-exit', exitCode: 1 });
    ws.close();
    return;
  }

  // Build child env: inherit container env, overlay Worker-provided vars
  const childEnv = { ...process.env, ...(extraEnv || {}) };

  // Spawn claude-agent.js with the same args the SSE path uses
  const args = [AGENT_SCRIPT, prompt, sessionId || '', cwd || '/workspace'];
  console.log(`[ws-agent-server] spawning agent, sessionId=${(sessionId || '').slice(0, 8)}${msgId ? ` msgId=${msgId.slice(0, 8)}` : ''}`);

  const child = spawn('node', args, {
    cwd: cwd || '/workspace',
    env: childEnv,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  activeChild = child;

  let stdoutBuf = '';

  child.stdout.on('data', (chunk) => {
    stdoutBuf += chunk.toString();
    const lines = stdoutBuf.split('\n');
    stdoutBuf = lines.pop() || '';
    for (const line of lines) {
      if (!line.trim()) continue;
      // Forward raw JSON lines as WS frames
      if (ws.readyState === 1) {
        ws.send(line);
      }
      // Buffer every chunk for replay (even if WS dropped mid-stream)
      if (bufferPath) {
        try { fs.appendFileSync(bufferPath, line + '\n'); } catch {}
      }
    }
  });

  child.stderr.on('data', (chunk) => {
    const text = chunk.toString().trim();
    if (!text) return;
    // Log agent debug output server-side
    if (text.startsWith('[claude-agent]')) {
      console.log(`[ws-agent-server] ${text.slice(0, 200)}`);
      // Also forward as debug frame so the browser can show it in the streaming panel
      if (ws.readyState === 1) {
        sendJson(ws, { type: 'stderr', text: text.slice(0, 300) });
      }
      return;
    }
    // Forward structured errors to the client
    if (text.startsWith('{')) {
      try {
        const parsed = JSON.parse(text);
        if (parsed.type === 'error') {
          sendJson(ws, { type: 'error', error: parsed.error || 'Agent error' });
          return;
        }
      } catch {}
    }
    // Forward cleaned stderr as error
    const firstLine = text.split('\n')[0].replace(/\s+at\s+.+$/, '').trim();
    sendJson(ws, { type: 'error', error: firstLine || 'Agent error' });
  });

  child.on('close', (code) => {
    activeChild = null;
    // Flush any remaining stdout
    if (stdoutBuf.trim() && ws.readyState === 1) {
      ws.send(stdoutBuf.trim());
      if (bufferPath) {
        try { fs.appendFileSync(bufferPath, stdoutBuf.trim() + '\n'); } catch {}
      }
    }
    sendJson(ws, { type: 'process-exit', exitCode: code || 0 });
    console.log(`[ws-agent-server] agent exited with code ${code}`);
    // Clean up buffer file on normal completion — client got everything
    if (bufferPath && !clientDisconnectedEarly) {
      try { fs.unlinkSync(bufferPath); } catch {}
    }
    // Don't close the WS — let the client close it
  });

  child.on('error', (err) => {
    activeChild = null;
    sendJson(ws, { type: 'error', error: `Spawn failed: ${err.message}` });
    sendJson(ws, { type: 'process-exit', exitCode: 1 });
    if (bufferPath && !clientDisconnectedEarly) {
      try { fs.unlinkSync(bufferPath); } catch {}
    }
  });

  // If client disconnects while agent is still running, mark dirty disconnect.
  // The buffer file is left intact so the replay endpoint can serve it.
  ws.on('close', () => {
    console.log('[ws-agent-server] client disconnected');
    if (child && !child.killed) {
      clientDisconnectedEarly = true;
      try { child.kill('SIGTERM'); } catch {}
      activeChild = null;
    }
  });
}

function sendJson(ws, obj) {
  if (ws.readyState === 1) {
    ws.send(JSON.stringify(obj));
  }
}

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('[ws-agent-server] shutting down');
  if (activeChild) {
    try { activeChild.kill('SIGTERM'); } catch {}
  }
  wss.close(() => process.exit(0));
});

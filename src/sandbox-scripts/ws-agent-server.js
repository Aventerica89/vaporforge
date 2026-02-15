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

wss.on('connection', (ws) => {
  console.log('[ws-agent-server] client connected');

  // Kill any lingering child from a previous aborted connection
  if (activeChild) {
    try { activeChild.kill('SIGTERM'); } catch {}
    activeChild = null;
  }

  // Wait briefly for context file to be written by the Worker
  setTimeout(() => startQuery(ws), 150);
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
  console.log(`[ws-agent-server] spawning agent, sessionId=${(sessionId || '').slice(0, 8)}`);

  const child = spawn('node', args, {
    cwd: cwd || '/workspace',
    env: childEnv,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  activeChild = child;

  let stdoutBuf = '';

  child.stdout.on('data', (chunk) => {
    if (ws.readyState !== 1) return; // WS not open
    stdoutBuf += chunk.toString();
    const lines = stdoutBuf.split('\n');
    stdoutBuf = lines.pop() || '';
    for (const line of lines) {
      if (!line.trim()) continue;
      // Forward raw JSON lines as WS frames
      ws.send(line);
    }
  });

  child.stderr.on('data', (chunk) => {
    const text = chunk.toString().trim();
    if (!text) return;
    // Log agent debug output server-side
    if (text.startsWith('[claude-agent]')) {
      console.log(`[ws-agent-server] ${text.slice(0, 200)}`);
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
    }
    sendJson(ws, { type: 'process-exit', exitCode: code || 0 });
    console.log(`[ws-agent-server] agent exited with code ${code}`);
    // Don't close the WS — let the client close it
  });

  child.on('error', (err) => {
    activeChild = null;
    sendJson(ws, { type: 'error', error: `Spawn failed: ${err.message}` });
    sendJson(ws, { type: 'process-exit', exitCode: 1 });
  });

  // If client disconnects, kill the child process
  ws.on('close', () => {
    console.log('[ws-agent-server] client disconnected');
    if (child && !child.killed) {
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

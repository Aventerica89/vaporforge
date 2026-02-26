#!/usr/bin/env node

// WebSocket agent server for VaporForge containers.
// Listens on port 8765, receives queries via context files,
// spawns claude-agent.js, and pipes stdout lines as WS frames.
//
// Lifecycle: Started once per container wake. Handles sequential queries.
// Protocol: Worker writes context to /tmp/vf-pending-query.json via
// sandbox.writeFile(), then proxies the browser WS via wsConnect(8765).
//
// Stability features (v0.30.0):
// - Ping keepalive every 25s (prevents idle connection kills during long thinks)
// - 120s grace period on disconnect (agent survives mobile app switches)
// - Reconnect: new WS client picks up running agent (buffer replay + live pipe)

const { WebSocketServer } = require('ws');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const PORT = 8765;
const CONTEXT_FILE = '/tmp/vf-pending-query.json';
const AGENT_SCRIPT = '/opt/claude-agent/claude-agent.js';
const PING_INTERVAL_MS = 25000;   // 25s — below CF's ~60s idle timeout
const GRACE_PERIOD_MS = 120000;   // 120s — survives mobile app switches

const wss = new WebSocketServer({ port: PORT });

// ─── Module-level state ───────────────────────────────────────────────────────
let activeChild = null;            // Currently running claude-agent.js process
let activeWs = null;               // Current WS client (mutable — updated on reconnect)
let activeBufferPath = '';         // JSONL buffer path for current stream
let clientDisconnectedEarly = false; // True when client drops before agent finishes
let paused = false;                // SIGSTOP pause state
let graceTimer = null;             // Grace period kill timer (cancellable on reconnect)
let pingInterval = null;           // Ping keepalive interval

// Idle shutdown: exit after 15 min with no active connections or running agent.
// CF stops billing for the container when the Node process exits.
const IDLE_TIMEOUT_MS = 15 * 60 * 1000;
let idleTimer = null;

function resetIdleTimer() {
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => {
    if (wss.clients.size === 0 && !activeChild) {
      console.log('[ws-agent-server] idle timeout — exiting to stop container billing');
      process.exit(0);
    } else {
      resetIdleTimer(); // still busy, try again later
    }
  }, IDLE_TIMEOUT_MS);
}

// Detect SDK version, CLI version, and build date at startup for diagnostics
let sdkVersion = 'unknown';
let cliVersion = 'unknown';
try {
  const sdkPkg = require('@anthropic-ai/claude-agent-sdk/package.json');
  sdkVersion = sdkPkg.version || 'unknown';
} catch {}
try {
  const cliPkg = require('@anthropic-ai/claude-code/package.json');
  cliVersion = cliPkg.version || 'unknown';
} catch {
  // CLI might not expose package.json — try reading from global install
  try {
    const { execFileSync } = require('child_process');
    cliVersion = execFileSync('node', ['-e', 'try{console.log(require("@anthropic-ai/claude-code/package.json").version)}catch{console.log("unknown")}'], { encoding: 'utf8', timeout: 5000 }).trim();
  } catch {}
}
const buildDate = process.env.VF_CONTAINER_BUILD || 'unknown';

console.log(`[ws-agent-server] listening on port ${PORT} (sdk=${sdkVersion} cli=${cliVersion} build=${buildDate})`);

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

// Start idle timer on boot — first connection will clear it
resetIdleTimer();

// ─── WS handlers (shared between normal + reconnect paths) ───────────────────

function setupWsHandlers(ws) {
  // Pause/resume via WS messages from browser
  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data.toString());
      if (msg.type === 'pause' && activeChild && !paused) {
        try {
          process.kill(activeChild.pid, 'SIGSTOP');
          paused = true;
          sendJson(ws, { type: 'paused' });
          console.log('[ws-agent-server] agent paused (SIGSTOP)');
        } catch (err) {
          sendJson(ws, { type: 'pause-failed', error: err.message });
          console.error('[ws-agent-server] SIGSTOP failed:', err.message);
        }
      } else if (msg.type === 'resume' && activeChild && paused) {
        try {
          process.kill(activeChild.pid, 'SIGCONT');
          paused = false;
          sendJson(ws, { type: 'resumed' });
          console.log('[ws-agent-server] agent resumed (SIGCONT)');
        } catch (err) {
          sendJson(ws, { type: 'resume-failed', error: err.message });
          console.error('[ws-agent-server] SIGCONT failed:', err.message);
        }
      } else if (msg.type === 'pong') {
        // Client responded to ping — connection is alive
      }
    } catch {} // malformed JSON — ignore
  });

  // Client disconnect — start grace period (don't kill agent immediately)
  ws.on('close', () => {
    console.log('[ws-agent-server] client disconnected');
    if (pingInterval) { clearInterval(pingInterval); pingInterval = null; }
    activeWs = null;
    if (activeChild && !activeChild.killed) {
      clientDisconnectedEarly = true;
      graceTimer = setTimeout(() => {
        graceTimer = null;
        if (activeChild && !activeChild.killed) {
          console.log('[ws-agent-server] grace period expired, killing agent');
          try { activeChild.kill('SIGTERM'); } catch {}
          activeChild = null;
        }
      }, GRACE_PERIOD_MS);
      // Clear timer if child exits naturally before grace period expires
      activeChild.once('exit', () => {
        if (graceTimer) { clearTimeout(graceTimer); graceTimer = null; }
      });
    }
    // Restart idle timer — exit if no new connection arrives within timeout
    resetIdleTimer();
  });
}

// ─── Connection handler ──────────────────────────────────────────────────────

wss.on('connection', (ws) => {
  clearTimeout(idleTimer);
  console.log('[ws-agent-server] client connected');

  // Start ping keepalive (prevents idle connection kills during long thinks)
  if (pingInterval) clearInterval(pingInterval);
  pingInterval = setInterval(() => {
    if (ws.readyState === 1) sendJson(ws, { type: 'ping' });
  }, PING_INTERVAL_MS);

  // Emit system-info so browser diagnostics can detect container SDK + CLI version
  sendJson(ws, {
    type: 'system-info',
    sdkVersion,
    cliVersion,
    buildDate,
    nodeVersion: process.version,
  });

  // ── Reconnect path: new client picking up a running agent ──
  if (activeChild && !activeChild.killed) {
    console.log('[ws-agent-server] reconnecting client to running agent');

    // Cancel grace period kill timer — client is back
    if (graceTimer) { clearTimeout(graceTimer); graceTimer = null; }
    clientDisconnectedEarly = false;

    // Clean up stale context file (Worker writes one before every WS proxy)
    try { fs.unlinkSync(CONTEXT_FILE); } catch {}

    // Replay buffered chunks so reconnecting client catches up
    let replayCount = 0;
    if (activeBufferPath && fs.existsSync(activeBufferPath)) {
      try {
        const buffer = fs.readFileSync(activeBufferPath, 'utf8');
        const lines = buffer.split('\n');
        for (const line of lines) {
          if (line.trim() && ws.readyState === 1) {
            ws.send(line);
            replayCount++;
          }
        }
      } catch (err) {
        console.error('[ws-agent-server] buffer replay error:', err.message);
      }
    }
    sendJson(ws, { type: 'replay-complete', replayedChunks: replayCount });

    // Switch to new client — stdout handler now sends to this WS
    activeWs = ws;
    setupWsHandlers(ws);
    return;
  }

  // Kill any dead/zombie child reference from a fully completed previous run
  if (activeChild) {
    try { activeChild.kill('SIGTERM'); } catch {}
    activeChild = null;
  }

  activeWs = ws;
  setupWsHandlers(ws);

  // Poll for context file (50ms intervals, 6s max) instead of hardcoded 150ms wait
  const POLL_INTERVAL = 50;
  const POLL_MAX = 6000;
  let elapsed = 0;
  const pollTimer = setInterval(() => {
    elapsed += POLL_INTERVAL;
    if (fs.existsSync(CONTEXT_FILE)) {
      clearInterval(pollTimer);
      startQuery();
    } else if (elapsed >= POLL_MAX) {
      clearInterval(pollTimer);
      console.log(`[ws-agent-server] context file not found after ${POLL_MAX / 1000}s — possible cold start race`);
      sendJson(ws, { type: 'error', error: 'Sandbox is still warming up. Try sending your message again in a few seconds.' });
      sendJson(ws, { type: 'process-exit', exitCode: 1, reason: 'context-timeout' });
      ws.close();
    }
  }, POLL_INTERVAL);
});

// ─── Query execution ─────────────────────────────────────────────────────────

function startQuery() {
  // Read context file written by the Worker
  let context;
  try {
    const raw = fs.readFileSync(CONTEXT_FILE, 'utf8');
    context = JSON.parse(raw);
  } catch (err) {
    if (activeWs) {
      sendJson(activeWs, { type: 'error', error: `Failed to read context: ${err.message}` });
      sendJson(activeWs, { type: 'process-exit', exitCode: 1, reason: 'context-read-error' });
      activeWs.close();
    }
    return;
  }

  // Delete context file immediately (contains secrets)
  try { fs.unlinkSync(CONTEXT_FILE); } catch {}

  const { prompt, sessionId, cwd, env: extraEnv, mode } = context;

  // Stream replay: buffer every chunk to JSONL so client can reconnect
  const msgId = (extraEnv && extraEnv.VF_MSG_ID) || '';
  activeBufferPath = msgId ? `/tmp/vf-stream-${msgId}.jsonl` : '';
  clientDisconnectedEarly = false;
  paused = false;

  if (!prompt) {
    if (activeWs) {
      sendJson(activeWs, { type: 'error', error: 'No prompt in context file' });
      sendJson(activeWs, { type: 'process-exit', exitCode: 1, reason: 'no-prompt' });
      activeWs.close();
    }
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
      // Forward raw JSON lines to current WS client (may have changed on reconnect)
      if (activeWs && activeWs.readyState === 1) {
        activeWs.send(line);
      }
      // Buffer every chunk for replay (even if WS dropped mid-stream)
      if (activeBufferPath) {
        try { fs.appendFileSync(activeBufferPath, line + '\n'); } catch {}
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
      if (activeWs && activeWs.readyState === 1) {
        sendJson(activeWs, { type: 'stderr', text: text.slice(0, 300) });
      }
      return;
    }
    // Forward structured errors to the client
    if (text.startsWith('{')) {
      try {
        const parsed = JSON.parse(text);
        if (parsed.type === 'error') {
          if (activeWs) sendJson(activeWs, { type: 'error', error: parsed.error || 'Agent error' });
          return;
        }
      } catch {}
    }
    // Skip known harmless CLI warnings (don't surface as errors)
    if (text.includes('Custom betas are only available') ||
        text.includes('Ignoring provided betas')) {
      console.log(`[ws-agent-server] CLI warning (suppressed): ${text.slice(0, 200)}`);
      return;
    }
    // Forward cleaned stderr as error
    const firstLine = text.split('\n')[0].replace(/\s+at\s+.+$/, '').trim();
    if (activeWs) sendJson(activeWs, { type: 'error', error: firstLine || 'Agent error' });
  });

  child.on('close', (code) => {
    activeChild = null;
    paused = false;
    // Flush any remaining stdout
    if (stdoutBuf.trim()) {
      if (activeWs && activeWs.readyState === 1) {
        activeWs.send(stdoutBuf.trim());
      }
      if (activeBufferPath) {
        try { fs.appendFileSync(activeBufferPath, stdoutBuf.trim() + '\n'); } catch {}
      }
    }
    if (activeWs) {
      sendJson(activeWs, { type: 'process-exit', exitCode: code || 0, reason: 'child-exit' });
    }
    console.log(`[ws-agent-server] agent exited with code ${code}`);
    // Clean up buffer file on normal completion — client got everything
    if (activeBufferPath && !clientDisconnectedEarly) {
      try { fs.unlinkSync(activeBufferPath); } catch {}
    }
    // Don't close the WS — let the client close it
  });

  child.on('error', (err) => {
    activeChild = null;
    if (activeWs) {
      sendJson(activeWs, { type: 'error', error: `Spawn failed: ${err.message}` });
      sendJson(activeWs, { type: 'process-exit', exitCode: 1, reason: 'spawn-error' });
    }
    if (activeBufferPath && !clientDisconnectedEarly) {
      try { fs.unlinkSync(activeBufferPath); } catch {}
    }
  });
}

// ─── Utilities ───────────────────────────────────────────────────────────────

function sendJson(ws, obj) {
  if (ws && ws.readyState === 1) {
    ws.send(JSON.stringify(obj));
  }
}

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('[ws-agent-server] shutting down');
  if (pingInterval) clearInterval(pingInterval);
  if (graceTimer) clearTimeout(graceTimer);
  if (activeChild) {
    try { activeChild.kill('SIGTERM'); } catch {}
  }
  wss.close(() => process.exit(0));
});

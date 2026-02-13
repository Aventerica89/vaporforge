# VaporForge Sandbox - Cloudflare Container
# Based on official cloudflare/sandbox-sdk/examples/claude-code pattern
FROM docker.io/cloudflare/sandbox:0.7.0

# Install Claude Code CLI (required by Agent SDK)
RUN npm install -g @anthropic-ai/claude-code

# Install Agent SDK globally + in /opt/claude-agent (keeps /workspace clean for user projects)
RUN npm install -g @anthropic-ai/claude-agent-sdk@latest && \
    mkdir -p /opt/claude-agent && cd /opt/claude-agent && npm init -y && npm install @anthropic-ai/claude-agent-sdk@latest
ENV NODE_PATH=/usr/local/lib/node_modules

# Install essential dev tools (keep minimal to avoid disk/build issues)
RUN apt-get update && apt-get install -y \
    git \
    curl \
    jq \
    gpg \
    && rm -rf /var/lib/apt/lists/*

# Install 1Password CLI for service account secret access
# Sandbox Claude can run: op read "op://App Dev/SECRET_NAME/credential"
RUN curl -sS https://downloads.1password.com/linux/keys/1password.asc | \
    gpg --dearmor --output /usr/share/keyrings/1password-archive-keyring.gpg && \
    echo "deb [arch=amd64 signed-by=/usr/share/keyrings/1password-archive-keyring.gpg] https://downloads.1password.com/linux/debian/amd64 stable main" > \
    /etc/apt/sources.list.d/1password.list && \
    apt-get update && apt-get install -y 1password-cli && \
    rm -rf /var/lib/apt/lists/*

# Increase command timeout for AI responses (5 min)
ENV COMMAND_TIMEOUT_MS=300000

# Create workspace directory
RUN mkdir -p /workspace

# Embed SDK wrapper script in /opt/claude-agent (not /workspace)
# IMPORTANT: Keep in sync with src/sandbox-scripts/claude-agent.js
RUN cat > /opt/claude-agent/claude-agent.js << 'CLAUDE_AGENT_EOF'
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

const fs = require('fs');
const path = require('path');

// Keys to strip from the env passed to the SDK's CLI child process.
// These are VF internal transport vars the SDK doesn't need directly.
const STRIP_FROM_SDK_ENV = new Set([
  'CLAUDE_MCP_SERVERS',        // VF internal transport (parsed separately into options.mcpServers)
]);

// Minimal YAML frontmatter parser (no external deps needed in container)
function parseFrontmatter(content) {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) return { meta: {}, body: content };
  const meta = {};
  for (const line of match[1].split('\n')) {
    const kv = line.match(/^(\w[\w-]*):\s*(.+)$/);
    if (kv) meta[kv[1]] = kv[2].trim();
  }
  return { meta, body: match[2] };
}

// Scan agents dir for .md files → build options.agents Record
// Per 1code research: settingSources does NOT discover agents.
// Agents MUST be explicitly loaded and passed via options.agents.
function loadAgentsFromDisk() {
  const configDir = process.env.CLAUDE_CONFIG_DIR || '/root/.claude';
  const agentsDir = path.join(configDir, 'agents');
  const agents = {};
  try {
    if (!fs.existsSync(agentsDir)) return agents;
    const files = fs.readdirSync(agentsDir).filter(f => f.endsWith('.md'));
    for (const file of files) {
      const content = fs.readFileSync(path.join(agentsDir, file), 'utf8');
      const { meta, body } = parseFrontmatter(content);
      const name = meta.name || file.replace(/\.md$/, '');
      agents[name] = { description: meta.description || '', prompt: body.trim() };
      if (meta.tools) {
        agents[name].tools = meta.tools.split(',').map(t => t.trim()).filter(Boolean);
      }
      if (meta.disallowedTools) {
        agents[name].disallowedTools = meta.disallowedTools.split(',').map(t => t.trim()).filter(Boolean);
      }
      if (meta.model) agents[name].model = meta.model;
    }
    const count = Object.keys(agents).length;
    if (count > 0) console.error(`[claude-agent] Loaded ${count} agent(s): ${Object.keys(agents).join(', ')}`);
  } catch (err) {
    console.error(`[claude-agent] Failed to load agents: ${err.message}`);
  }
  return agents;
}

// Extract a user-friendly error message from SDK errors
function cleanErrorMessage(err) {
  const raw = err.stack || err.message || String(err);
  const exitMatch = raw.match(/process exited with code (\d+)/i);
  if (exitMatch) {
    return `Claude Code process crashed (exit code ${exitMatch[1]}). This usually means the session state is stale or the sandbox restarted.`;
  }
  const firstLine = raw.split('\n')[0].trim();
  return firstLine.length > 200 ? firstLine.slice(0, 200) + '...' : firstLine;
}

function buildOptions(prompt, sessionId, cwd, useResume) {
  const oauthToken = process.env.CLAUDE_CODE_OAUTH_TOKEN || '';
  const agents = loadAgentsFromDisk();

  // Filter out keys the SDK's CLI child process shouldn't see
  const filteredEnv = Object.fromEntries(
    Object.entries(process.env).filter(([k]) => !STRIP_FROM_SDK_ENV.has(k))
  );

  // Parse MCP servers from env if provided (set by VF Worker)
  let mcpServers;
  try {
    const mcpRaw = process.env.CLAUDE_MCP_SERVERS;
    if (mcpRaw) {
      mcpServers = JSON.parse(mcpRaw);
      const count = Object.keys(mcpServers).length;
      if (count > 0) {
        console.error(`[claude-agent] Loaded ${count} MCP server(s): ${Object.keys(mcpServers).join(', ')}`);
      }
    }
  } catch (err) {
    console.error(`[claude-agent] Failed to parse CLAUDE_MCP_SERVERS: ${err.message}`);
  }

  return {
    model: 'claude-sonnet-4-5',
    cwd: cwd || '/workspace',
    settingSources: ['user', 'project'],
    agents,
    ...(mcpServers ? { mcpServers } : {}),
    includePartialMessages: true,
    permissionMode: 'bypassPermissions',
    allowDangerouslySkipPermissions: true,
    continue: true,
    systemPrompt: {
      type: 'preset',
      preset: 'claude_code',
      append: 'You are working in a cloud sandbox (VaporForge). Always create, edit, and manage files in /workspace (your cwd). Never use /tmp unless explicitly asked.',
    },
    env: {
      ...filteredEnv,
      ...(oauthToken ? { CLAUDE_CODE_OAUTH_TOKEN: oauthToken } : {}),
      NODE_PATH: process.env.NODE_PATH || '/usr/local/lib/node_modules',
      PATH: process.env.PATH || '/usr/local/bin:/usr/bin:/bin',
      CLAUDE_CONFIG_DIR: process.env.CLAUDE_CONFIG_DIR || '/root/.claude',
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
    if (msg.type === 'system' && msg.subtype === 'init' && msg.session_id) {
      newSessionId = msg.session_id;
      console.log(JSON.stringify({ type: 'session-init', sessionId: newSessionId }));
    }

    if (msg.type === 'stream_event') {
      const event = msg.event;
      if (event && event.type === 'content_block_delta' && event.delta && event.delta.type === 'text_delta') {
        responseText += event.delta.text;
        console.log(JSON.stringify({ type: 'text-delta', text: event.delta.text }));
      }
    }

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
      responseText = msg.message.content
        .filter(b => b.type === 'text')
        .map(b => b.text)
        .join('');
    }

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

    if (msg.type === 'result' && msg.session_id) {
      newSessionId = msg.session_id;
    }

    if (msg.type === 'error') {
      const errorMsg = msg.error || msg.errorText || 'Unknown SDK error';
      console.log(JSON.stringify({ type: 'error', error: errorMsg }));
    }
  }

  return { newSessionId, responseText };
}

async function handleQuery(prompt, sessionId, cwd) {
  let result;

  try {
    result = await runStream(prompt, sessionId, cwd, !!sessionId);
  } catch (err) {
    const friendly = cleanErrorMessage(err);

    if (sessionId) {
      console.log(JSON.stringify({
        type: 'error',
        error: `Session resume failed: ${friendly}. Starting fresh session...`,
      }));
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
      console.log(JSON.stringify({ type: 'error', error: friendly }));
      console.log(JSON.stringify({ type: 'done', sessionId: '', fullText: '' }));
      return;
    }
  }

  console.log(JSON.stringify({
    type: 'done',
    sessionId: result.newSessionId,
    fullText: result.responseText,
  }));
}

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
  const friendly = cleanErrorMessage(err);
  console.log(JSON.stringify({ type: 'error', error: friendly }));
  console.log(JSON.stringify({ type: 'done', sessionId: '', fullText: '' }));
  console.error(`[claude-agent] fatal: ${err.stack || err.message || err}`);
  process.exit(0);
});
CLAUDE_AGENT_EOF

RUN chmod +x /opt/claude-agent/claude-agent.js

# Embed MCP relay proxy for browser-to-container MCP tunneling
# IMPORTANT: Keep in sync with src/sandbox-scripts/mcp-relay-proxy.js
RUN cat > /opt/claude-agent/mcp-relay-proxy.js << 'MCP_RELAY_EOF'
#!/usr/bin/env node

// MCP Relay Proxy — runs inside the container on port 9788.
// Forwards JSON-RPC from SDK to Worker relay endpoint.

const http = require('http');
const https = require('https');

const PORT = 9788;
const TIMEOUT_MS = 30000;
const RELAY_URL = process.env.RELAY_URL || '';
const RELAY_TOKEN = process.env.RELAY_TOKEN || '';

if (!RELAY_URL || !RELAY_TOKEN) {
  console.error('[mcp-relay-proxy] Missing RELAY_URL or RELAY_TOKEN, exiting.');
  process.exit(1);
}

function forwardRequest(serverName, body) {
  return new Promise((resolve, reject) => {
    const url = new URL(`${RELAY_URL}/${serverName}`);
    const payload = JSON.stringify(body);
    const mod = url.protocol === 'https:' ? https : http;

    const req = mod.request(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${RELAY_TOKEN}`,
        'Content-Length': Buffer.byteLength(payload),
      },
      timeout: TIMEOUT_MS,
    }, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        const raw = Buffer.concat(chunks).toString();
        try { resolve(JSON.parse(raw)); }
        catch { resolve({ jsonrpc: '2.0', error: { code: -32603, message: raw } }); }
      });
    });

    req.on('error', (err) => reject(err));
    req.on('timeout', () => { req.destroy(); reject(new Error('Relay request timed out')); });
    req.write(payload);
    req.end();
  });
}

const server = http.createServer(async (req, res) => {
  const match = req.url?.match(/^\/mcp\/([a-zA-Z0-9_-]+)\/?$/);
  if (!match || req.method !== 'POST') {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
    return;
  }

  const serverName = match[1];
  const chunks = [];
  for await (const chunk of req) { chunks.push(chunk); }

  let body;
  try { body = JSON.parse(Buffer.concat(chunks).toString()); }
  catch {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ jsonrpc: '2.0', error: { code: -32700, message: 'Parse error' } }));
    return;
  }

  try {
    const result = await forwardRequest(serverName, body);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(result));
  } catch (err) {
    res.writeHead(502, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ jsonrpc: '2.0', error: { code: -32603, message: err.message || 'Relay error' } }));
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[mcp-relay-proxy] Listening on http://127.0.0.1:${PORT}`);
});
MCP_RELAY_EOF

RUN chmod +x /opt/claude-agent/mcp-relay-proxy.js

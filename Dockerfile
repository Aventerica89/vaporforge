# VaporForge Sandbox - Cloudflare Container
# Based on official cloudflare/sandbox-sdk/examples/claude-code pattern
FROM docker.io/cloudflare/sandbox:0.7.0

# Install Claude Code CLI (required by Agent SDK)
RUN npm install -g @anthropic-ai/claude-code

# Install Agent SDK globally + in /opt/claude-agent (keeps /workspace clean for user projects)
RUN npm install -g @anthropic-ai/claude-agent-sdk@latest ws && \
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

// Synchronous, unbuffered write to stdout (fd 1).
// Bypasses Node's stream buffering which blocks output when piped.
function emit(obj) {
  fs.writeSync(1, JSON.stringify(obj) + '\n');
}

// Keys to strip from the env passed to the SDK's CLI child process.
// These are VF internal transport vars the SDK doesn't need directly.
const STRIP_FROM_SDK_ENV = new Set([
  'CLAUDE_MCP_SERVERS',        // VF internal transport (parsed separately into options.mcpServers)
  'VF_SESSION_MODE',           // VF internal (read in buildOptions, not needed by CLI)
  'VF_AUTO_CONTEXT',           // VF internal (read in buildOptions to control auto-context injection)
  'VF_AUTONOMY_MODE',          // VF internal (read in buildOptions to set permissionMode)
  'VF_MAX_BUDGET_USD',         // VF internal (read in buildOptions to set maxBudgetUsd)
]);

// Tools blocked in plan mode (read-only research mode).
// Plan mode allows reading, searching, and web browsing but blocks mutations.
const PLAN_MODE_BLOCKED_TOOLS = new Set([
  'Bash',
  'Write',
  'Edit',
  'NotebookEdit',
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

      agents[name] = {
        description: meta.description || '',
        prompt: body.trim(),
      };

      if (meta.tools) {
        agents[name].tools = meta.tools.split(',').map(t => t.trim()).filter(Boolean);
      }
      if (meta.disallowedTools) {
        agents[name].disallowedTools = meta.disallowedTools.split(',').map(t => t.trim()).filter(Boolean);
      }
      if (meta.model) {
        agents[name].model = meta.model;
      }
    }

    const count = Object.keys(agents).length;
    if (count > 0) {
      console.error(`[claude-agent] Loaded ${count} agent(s): ${Object.keys(agents).join(', ')}`);
    }
  } catch (err) {
    console.error(`[claude-agent] Failed to load agents: ${err.message}`);
  }

  return agents;
}

// Build the system prompt append string, optionally including auto-context.
// Auto-context is gathered by gather-context.sh at container startup and
// cached to /tmp/vf-auto-context.md. Disabled when VF_AUTO_CONTEXT === '0'.
const BASE_SYSTEM_APPEND = 'You are working in a cloud sandbox (VaporForge). Always create, edit, and manage files in /workspace (your cwd). Never use /tmp unless explicitly asked.';
const AUTO_CONTEXT_PATH = '/tmp/vf-auto-context.md';

function buildSystemPromptAppend() {
  if (process.env.VF_AUTO_CONTEXT === '0') {
    return BASE_SYSTEM_APPEND;
  }

  try {
    if (fs.existsSync(AUTO_CONTEXT_PATH)) {
      const ctx = fs.readFileSync(AUTO_CONTEXT_PATH, 'utf8').trim();
      if (ctx) {
        console.error(`[claude-agent] Auto-context loaded (${ctx.length} chars)`);
        return BASE_SYSTEM_APPEND + '\n\n' + ctx;
      }
    }
  } catch (err) {
    console.error(`[claude-agent] Failed to read auto-context: ${err.message}`);
  }

  return BASE_SYSTEM_APPEND;
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
  const mode = process.env.VF_SESSION_MODE || 'agent';
  const isPlan = mode === 'plan';
  const isAgency = process.env.VF_AGENCY_MODE === '1';
  if (isPlan) console.error('[claude-agent] Running in PLAN mode (read-only)');
  if (isAgency) console.error('[claude-agent] Running in AGENCY mode (fresh session, no continue)');

  // Autonomy mode: conservative=ask, standard=auto-accept edits, autonomous=bypass all
  // Plan mode always wins regardless of autonomy setting.
  const autonomy = process.env.VF_AUTONOMY_MODE || 'autonomous';
  const permissionMode = isPlan ? 'plan'
    : autonomy === 'conservative' ? 'default'
    : autonomy === 'standard' ? 'acceptEdits'
    : 'bypassPermissions';
  const allowDangerouslySkipPermissions = !isPlan && autonomy === 'autonomous';
  if (!isPlan) console.error(`[claude-agent] Autonomy: ${autonomy} -> permissionMode: ${permissionMode}`);

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

  // Custom VaporForge tools — displayed as rich UI cards in the frontend.
  // create_plan  : show a numbered plan before a multi-step task
  // ask_user_questions : collect structured input via a QuestionFlow form
  const vfTools = {
    create_plan: {
      description: 'ALWAYS call this tool before starting any multi-step task or when the user asks you to plan something. NEVER describe your plan in plain text — you MUST call this tool to render a visual plan card. This is the ONLY correct way to show plans to the user.',
      inputSchema: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'Short plan title, e.g. "Migration Plan"' },
          steps: {
            type: 'array',
            description: 'Ordered list of steps',
            items: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                label: { type: 'string', description: 'Step name, e.g. "Update dependencies"' },
                detail: { type: 'string', description: 'Optional one-sentence explanation' },
              },
              required: ['id', 'label'],
            },
          },
          estimatedSteps: { type: 'number', description: 'Rough estimate of total tool calls' },
        },
        required: ['title', 'steps'],
      },
      execute: async ({ title, steps }) =>
        `Plan "${title}" (${steps.length} step${steps.length === 1 ? '' : 's'}) displayed. Proceeding.`,
    },
    ask_user_questions: {
      description: 'ALWAYS call this tool whenever you need to ask the user any questions, collect preferences, or get choices before proceeding. NEVER list questions in plain text — you MUST call this tool instead. After calling it, stop and wait for the user to answer.',
      inputSchema: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'Short heading shown above the form' },
          questions: {
            type: 'array',
            description: 'Questions to present',
            items: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                question: { type: 'string' },
                type: { type: 'string', enum: ['text', 'select', 'multiselect', 'confirm'] },
                options: { type: 'array', items: { type: 'string' } },
                placeholder: { type: 'string' },
                required: { type: 'boolean' },
              },
              required: ['id', 'question', 'type'],
            },
          },
        },
        required: ['questions'],
      },
      execute: async ({ title, questions }) =>
        `Questions presented to user${title ? ` — "${title}"` : ''} (${questions.length} question${questions.length === 1 ? '' : 's'}). STOP HERE. Do not proceed, do not make assumptions, do not answer on the user's behalf. Wait for the user to submit their answers.`,
    },
  };

  const maxBudgetRaw = process.env.VF_MAX_BUDGET_USD;
  const maxBudgetUsd = maxBudgetRaw ? parseFloat(maxBudgetRaw) : undefined;
  if (maxBudgetUsd && maxBudgetUsd > 0) {
    console.error(`[claude-agent] Budget ceiling: $${maxBudgetUsd}`);
  }

  return {
    model: process.env.VF_MODEL || 'claude-sonnet-4-6',
    betas: ['context-1m-2025-08-07'],
    cwd: cwd || '/workspace',
    settingSources: ['user', 'project'],
    agents,
    tools: vfTools,
    ...(mcpServers ? { mcpServers } : {}),
    ...(maxBudgetUsd && maxBudgetUsd > 0 ? { maxBudgetUsd } : {}),
    includePartialMessages: true,
    permissionMode,
    allowDangerouslySkipPermissions,
    ...(isPlan ? {
      canUseTool: async (toolName) => {
        if (PLAN_MODE_BLOCKED_TOOLS.has(toolName)) {
          console.error(`[claude-agent] Plan mode: blocked ${toolName}`);
          return false;
        }
        return true;
      },
    } : {}),
    // Agency edits always start fresh — no accumulated conversation history from prior failed attempts
    ...(isAgency ? {} : { continue: true }),
    systemPrompt: {
      type: 'preset',
      preset: 'claude_code',
      append: buildSystemPromptAppend(),
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
  let resultUsage = null;
  let resultCostUsd = null;

  // Dedup: track emitted tool IDs to skip duplicates
  // (tools can arrive via streaming AND in the final assistant message)
  const emittedToolIds = new Set();

  // Track parent tool context for composite IDs (nested agent tools)
  let currentParentToolUseId = null;

  // Map original toolId -> composite toolId (for tool-result matching)
  const toolIdMapping = new Map();

  // Helper: create composite ID for nested tools ("parentId:childId")
  const makeCompositeId = (originalId, parentId) =>
    parentId ? `${parentId}:${originalId}` : originalId;

  for await (const msg of stream) {
    // Session ID from system init event (snake_case per SDK)
    if (msg.type === 'system' && msg.subtype === 'init' && msg.session_id) {
      newSessionId = msg.session_id;
      emit({ type: 'session-init', sessionId: newSessionId });
    }

    // Forward compaction status so the frontend can show a banner.
    // The SDK emits system events when auto-compacting context (~119s silence).
    if (msg.type === 'system' && msg.subtype !== 'init') {
      const raw = JSON.stringify(msg).toLowerCase();
      if (raw.includes('compact')) {
        emit({ type: 'system-status', status: 'compacting' });
      }
    }

    // Track parent_tool_use_id for nested agent tools
    if (msg.parent_tool_use_id !== undefined) {
      currentParentToolUseId = msg.parent_tool_use_id;
    }

    // Streaming text deltas (requires includePartialMessages: true)
    if (msg.type === 'stream_event') {
      const event = msg.event;
      if (event && event.type === 'content_block_delta' && event.delta && event.delta.type === 'text_delta') {
        responseText += event.delta.text;
        emit({ type: 'text-delta', text: event.delta.text });
      }
    }

    // Tool use events - forward tool invocations for UI display
    if (msg.type === 'assistant' && msg.message && msg.message.content) {
      for (const block of msg.message.content) {
        if (block.type === 'tool_use') {
          const originalId = block.id || `tool-${Date.now()}`;
          const compositeId = makeCompositeId(originalId, currentParentToolUseId);

          // Skip if already emitted (dedup streaming vs final message)
          if (emittedToolIds.has(compositeId)) continue;
          emittedToolIds.add(compositeId);

          // Store mapping so tool-result can find the composite ID
          toolIdMapping.set(originalId, compositeId);

          emit({
            type: 'tool-start',
            id: compositeId,
            name: block.name || 'unknown',
            input: block.input || {},
          });
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
      // Resolve composite ID from mapping, fallback to original
      const originalId = toolEvent.tool_use_id || toolEvent.id || '';
      const compositeId = toolIdMapping.get(originalId) || originalId;

      emit({
        type: 'tool-result',
        id: compositeId,
        name: toolEvent.name || toolEvent.tool_name || 'unknown',
        output: typeof toolEvent.output === 'string'
          ? toolEvent.output.slice(0, 500)
          : JSON.stringify(toolEvent.output || toolEvent.content || '').slice(0, 500),
      });
    }

    // Result message with final session_id, token usage, and cost
    if (msg.type === 'result') {
      if (msg.session_id) newSessionId = msg.session_id;
      if (msg.usage) {
        resultUsage = {
          inputTokens: msg.usage.input_tokens ?? 0,
          outputTokens: msg.usage.output_tokens ?? 0,
        };
      }
      if (typeof msg.total_cost_usd === 'number') {
        resultCostUsd = msg.total_cost_usd;
      }
    }

    // Handle errors from SDK — report but don't exit
    // process.exit(1) here kills the RPC stream, causing
    // "ReadableStream received over RPC disconnected prematurely"
    if (msg.type === 'error') {
      const errorMsg = msg.error || msg.errorText || 'Unknown SDK error';
      const isBudgetError = typeof errorMsg === 'string' &&
        (errorMsg.toLowerCase().includes('max_budget') || errorMsg.toLowerCase().includes('budget'));
      emit({
        type: 'error',
        error: isBudgetError
          ? 'Budget ceiling reached. Your per-session spend limit was hit. Increase or clear it in Settings → Command Center.'
          : errorMsg,
      });
      // Let the for-await loop complete — 'done' will be sent at the end
    }

    // Budget exceeded can also arrive as a result with is_error flag
    if (msg.type === 'result' && msg.is_error) {
      const errStr = typeof msg.error === 'string' ? msg.error : JSON.stringify(msg.error || '');
      if (errStr.toLowerCase().includes('max_budget') || errStr.toLowerCase().includes('budget')) {
        emit({
          type: 'error',
          error: 'Budget ceiling reached. Your per-session spend limit was hit. Increase or clear it in Settings → Command Center.',
        });
      }
    }
  }

  return { newSessionId, responseText, usage: resultUsage, costUsd: resultCostUsd };
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
      emit({
        type: 'error',
        error: `Session resume failed: ${friendly}. Starting fresh session...`,
      });
      // Signal to backend that the old sdkSessionId is invalid
      emit({ type: 'session-reset' });

      try {
        result = await runStream(prompt, '', cwd, false);
      } catch (retryErr) {
        const retryMsg = cleanErrorMessage(retryErr);
        emit({ type: 'error', error: retryMsg });
        emit({ type: 'done', sessionId: '', fullText: '' });
        return;
      }
    } else {
      // No session to retry without — report the error
      emit({ type: 'error', error: friendly });
      emit({ type: 'done', sessionId: '', fullText: '' });
      return;
    }
  }

  // Final message with complete response
  emit({
    type: 'done',
    sessionId: result.newSessionId,
    fullText: result.responseText,
    ...(result.usage ? { usage: result.usage } : {}),
    ...(result.costUsd !== null ? { costUsd: result.costUsd } : {}),
  });
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
  emit({ type: 'error', error: friendly });
  emit({ type: 'done', sessionId: '', fullText: '' });
  // Log full detail to stderr for server-side debugging only
  console.error(`[claude-agent] fatal: ${err.stack || err.message || err}`);
  // Exit cleanly (code 0) — errors are already reported via stdout protocol.
  // Using exit(1) causes the backend to emit a redundant "process exited with code 1" error.
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

# Embed Gemini MCP server for AI provider integration
# IMPORTANT: Keep in sync with src/sandbox-scripts/gemini-mcp-server.js
RUN cat > /opt/claude-agent/gemini-mcp-server.js << 'GEMINI_MCP_EOF'
#!/usr/bin/env node

// Gemini MCP Server — runs inside the Cloudflare Sandbox container.
// Zero-dependency MCP server using JSON-RPC 2.0 over stdin/stdout.
// Reads GEMINI_API_KEY from env. Calls Gemini REST API via Node https.

const https = require('https');
const fs = require('fs');
const path = require('path');

const API_KEY = process.env.GEMINI_API_KEY || '';
const API_HOST = 'generativelanguage.googleapis.com';
const MODELS = {
  flash: 'gemini-2.5-flash',
  pro: 'gemini-2.5-pro',
};

const ALLOWED_ROOTS = ['/workspace', '/root'];

const TOOLS = [
  {
    name: 'gemini_quick_query',
    description: 'Ask Google Gemini a quick question. Uses Gemini 2.5 Flash for fast responses. Good for explanations, brainstorming, quick code snippets, and general Q&A.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'The question or prompt to send to Gemini' },
      },
      required: ['query'],
    },
  },
  {
    name: 'gemini_analyze_code',
    description: 'Send code to Google Gemini for deep analysis. Uses Gemini 2.5 Pro for thorough review. Good for security audits, performance review, architecture analysis, and refactoring suggestions.',
    inputSchema: {
      type: 'object',
      properties: {
        code: { type: 'string', description: 'The code to analyze' },
        language: { type: 'string', description: 'Programming language (e.g. typescript, python)' },
        focus: { type: 'string', description: 'Analysis focus', enum: ['security', 'performance', 'architecture', 'refactoring', 'bugs', 'general'] },
      },
      required: ['code'],
    },
  },
  {
    name: 'gemini_codebase_analysis',
    description: 'Analyze multiple files from the workspace using Google Gemini. Reads files from disk and sends them to Gemini 2.5 Pro for cross-file analysis.',
    inputSchema: {
      type: 'object',
      properties: {
        file_paths: { type: 'array', items: { type: 'string' }, description: 'Absolute file paths to analyze (must be under /workspace or /root)' },
        question: { type: 'string', description: 'What to analyze about these files' },
      },
      required: ['file_paths', 'question'],
    },
  },
];

const MAX_RETRIES = 3;
const BASE_DELAY_MS = 2000;
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

function callGeminiOnce(model, prompt) {
  return new Promise((resolve, reject) => {
    const apiPath = `/v1beta/models/${model}:generateContent?key=${API_KEY}`;
    const payload = JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { maxOutputTokens: 8192, temperature: 0.7 },
    });
    const req = https.request({
      hostname: API_HOST, path: apiPath, method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) },
      timeout: 120000,
    }, (res) => {
      const statusCode = res.statusCode || 0;
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const raw = Buffer.concat(chunks).toString();
        try {
          const data = JSON.parse(raw);
          if (statusCode === 429 || data.error?.status === 'RESOURCE_EXHAUSTED') {
            const retryAfter = res.headers['retry-after'];
            const err = new Error(data.error?.message || 'Rate limit exceeded');
            err.retryable = true;
            err.retryAfterMs = retryAfter ? parseInt(retryAfter, 10) * 1000 : 0;
            reject(err); return;
          }
          if (statusCode === 503 || statusCode === 500) {
            const err = new Error(data.error?.message || `Server error ${statusCode}`);
            err.retryable = true;
            reject(err); return;
          }
          if (data.error) { reject(new Error(data.error.message || 'Gemini API error')); return; }
          resolve(data.candidates?.[0]?.content?.parts?.[0]?.text || '');
        } catch { reject(new Error('Failed to parse Gemini response')); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Gemini API request timed out')); });
    req.write(payload);
    req.end();
  });
}

async function callGemini(model, prompt) {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try { return await callGeminiOnce(model, prompt); }
    catch (err) {
      if (!err.retryable || attempt === MAX_RETRIES) throw err;
      const delay = err.retryAfterMs || BASE_DELAY_MS * Math.pow(2, attempt);
      process.stderr.write(`[gemini-mcp] Rate limited, retrying in ${delay}ms (${attempt + 1}/${MAX_RETRIES})...\n`);
      await sleep(delay);
    }
  }
}

function isPathAllowed(fp) { return ALLOWED_ROOTS.some((r) => path.resolve(fp).startsWith(r)); }

function readFilesSafe(fps) {
  return fps.map((fp) => {
    if (!isPathAllowed(fp)) return { path: fp, error: 'Path not allowed' };
    try { return { path: fp, content: fs.readFileSync(fp, 'utf8') }; }
    catch (e) { return { path: fp, error: e.message }; }
  });
}

async function handleToolCall(name, args) {
  if (!API_KEY) return { isError: true, content: [{ type: 'text', text: 'GEMINI_API_KEY not configured. Add it in Settings > AI Providers.' }] };
  switch (name) {
    case 'gemini_quick_query': {
      const text = await callGemini(MODELS.flash, args.query);
      return { content: [{ type: 'text', text }] };
    }
    case 'gemini_analyze_code': {
      const lang = args.language || 'unknown';
      const focus = args.focus || 'general';
      const prompt = `Analyze the following ${lang} code. Focus: ${focus}.\nProvide specific, actionable feedback.\n\n\`\`\`${lang}\n${args.code}\n\`\`\``;
      return { content: [{ type: 'text', text: await callGemini(MODELS.pro, prompt) }] };
    }
    case 'gemini_codebase_analysis': {
      const files = readFilesSafe(args.file_paths || []);
      const blocks = files.map((f) => f.error ? `--- ${f.path} ---\n[Error: ${f.error}]` : `--- ${f.path} ---\n${f.content}`);
      return { content: [{ type: 'text', text: await callGemini(MODELS.pro, `${args.question}\n\nFiles:\n\n${blocks.join('\n\n')}`) }] };
    }
    default: return { isError: true, content: [{ type: 'text', text: `Unknown tool: ${name}` }] };
  }
}

function makeResponse(id, result) { return JSON.stringify({ jsonrpc: '2.0', id, result }); }
function makeError(id, code, msg) { return JSON.stringify({ jsonrpc: '2.0', id, error: { code, message: msg } }); }

async function handleMessage(msg) {
  const { id, method, params } = msg;
  switch (method) {
    case 'initialize':
      return makeResponse(id, { protocolVersion: '2024-11-05', capabilities: { tools: {} }, serverInfo: { name: 'gemini-mcp-server', version: '1.0.0' } });
    case 'notifications/initialized': return null;
    case 'tools/list': return makeResponse(id, { tools: TOOLS });
    case 'tools/call': {
      try { return makeResponse(id, await handleToolCall(params?.name, params?.arguments || {})); }
      catch (e) { return makeResponse(id, { isError: true, content: [{ type: 'text', text: `Gemini error: ${e.message || e}` }] }); }
    }
    case 'ping': return makeResponse(id, {});
    default: return makeError(id, -32601, `Method not found: ${method}`);
  }
}

let buffer = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', async (chunk) => {
  buffer += chunk;
  const lines = buffer.split('\n');
  buffer = lines.pop() || '';
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const response = await handleMessage(JSON.parse(trimmed));
      if (response) process.stdout.write(response + '\n');
    } catch (e) { process.stderr.write(`[gemini-mcp] Parse error: ${e.message || e}\n`); }
  }
});
process.stdin.on('end', () => process.exit(0));
process.stderr.write('[gemini-mcp] Server started\n');
GEMINI_MCP_EOF

RUN chmod +x /opt/claude-agent/gemini-mcp-server.js

# Embed WebSocket agent server for real-time streaming
# IMPORTANT: Keep in sync with src/sandbox-scripts/ws-agent-server.js
RUN cat > /opt/claude-agent/ws-agent-server.js << 'WS_SERVER_EOF'
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
WS_SERVER_EOF

RUN chmod +x /opt/claude-agent/ws-agent-server.js

# Embed auto-context gathering script
# IMPORTANT: Keep in sync with src/sandbox-scripts/gather-context.sh
RUN cat > /opt/claude-agent/gather-context.sh << 'GATHER_CONTEXT_EOF'
#!/usr/bin/env bash
# VaporForge Session Auto-Context Gatherer
# Runs ONCE at container startup inside /workspace.
# Outputs structured markdown (max ~2KB) for Claude's system prompt.
# Must NEVER fail — all sections are guarded and exit 0 is guaranteed.

set -o pipefail 2>/dev/null || true

MAX_CHARS=2048
output=""

append() {
  local text="$1"
  local remaining=$(( MAX_CHARS - ${#output} ))
  if [ "$remaining" -le 0 ]; then
    return 1
  fi
  if [ "${#text}" -gt "$remaining" ]; then
    output="${output}${text:0:$remaining}"
    return 1
  fi
  output="${output}${text}"
  return 0
}

cd /workspace 2>/dev/null || exit 0

append "## Project State (auto-generated)
" || { printf '%s' "$output"; exit 0; }

# --- Git ---
if [ -d .git ] && command -v git >/dev/null 2>&1; then
  branch=$(git branch --show-current 2>/dev/null)
  if [ -n "$branch" ]; then
    append "
### Git
Branch: ${branch}
" || { printf '%s' "$output"; exit 0; }

    status=$(git status --short 2>/dev/null | head -20)
    if [ -n "$status" ]; then
      append "Status:
${status}
" || { printf '%s' "$output"; exit 0; }
    else
      append "Status: clean working tree
" || { printf '%s' "$output"; exit 0; }
    fi

    log=$(git log --oneline -5 2>/dev/null)
    if [ -n "$log" ]; then
      append "
Recent commits:
${log}
" || { printf '%s' "$output"; exit 0; }
    fi
  fi
fi

# --- TODOs ---
if command -v grep >/dev/null 2>&1; then
  todos=$(grep -rn 'TODO\|FIXME\|HACK' \
    --include='*.ts' --include='*.tsx' --include='*.js' --include='*.jsx' \
    --include='*.py' --include='*.rs' --include='*.go' \
    --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=dist \
    . 2>/dev/null | head -15)
  if [ -n "$todos" ]; then
    append "
### TODOs
${todos}
" || { printf '%s' "$output"; exit 0; }
  fi
fi

# --- Code Intelligence ---
append "
### Code Intelligence
" || { printf '%s' "$output"; exit 0; }

# File counts by extension
ts_count=$(find . -name '*.ts' -o -name '*.tsx' 2>/dev/null | grep -v node_modules | grep -v .git | wc -l | tr -d ' ')
js_count=$(find . -name '*.js' -o -name '*.jsx' 2>/dev/null | grep -v node_modules | grep -v .git | wc -l | tr -d ' ')
py_count=$(find . -name '*.py' 2>/dev/null | grep -v node_modules | grep -v .git | wc -l | tr -d ' ')

counts=""
[ "$ts_count" -gt 0 ] 2>/dev/null && counts="${counts}${ts_count} TS/TSX, "
[ "$js_count" -gt 0 ] 2>/dev/null && counts="${counts}${js_count} JS/JSX, "
[ "$py_count" -gt 0 ] 2>/dev/null && counts="${counts}${py_count} Python, "
counts="${counts%, }"
if [ -n "$counts" ]; then
  append "Files: ${counts}
" || { printf '%s' "$output"; exit 0; }
fi

# Package dependencies
if [ -f package.json ]; then
  deps=$(node -e '
    try {
      const p = JSON.parse(require("fs").readFileSync("package.json","utf8"));
      const d = Object.keys(p.dependencies||{}).length;
      const dd = Object.keys(p.devDependencies||{}).length;
      console.log(d + " prod, " + dd + " dev");
    } catch {}
  ' 2>/dev/null)
  if [ -n "$deps" ]; then
    append "Dependencies: ${deps}
" || { printf '%s' "$output"; exit 0; }
  fi
fi

# Cached test coverage
if [ -f coverage/coverage-summary.json ]; then
  cov=$(node -e '
    try {
      const c = JSON.parse(require("fs").readFileSync("coverage/coverage-summary.json","utf8"));
      console.log(c.total.lines.pct + "%");
    } catch {}
  ' 2>/dev/null)
  if [ -n "$cov" ]; then
    append "Test coverage: ${cov}
" || { printf '%s' "$output"; exit 0; }
  fi
fi

# --- Previous Session Summary ---
if [ -f .vaporforge/session-summary.md ]; then
  summary=$(head -50 .vaporforge/session-summary.md 2>/dev/null)
  if [ -n "$summary" ]; then
    append "
### Previous Session
${summary}
" || { printf '%s' "$output"; exit 0; }
  fi
fi

printf '%s' "$output"
exit 0
GATHER_CONTEXT_EOF

RUN chmod +x /opt/claude-agent/gather-context.sh

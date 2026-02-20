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
//   { type: "done", sessionId: "...", fullText: "...", usage?: {inputTokens, outputTokens} }
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
  if (isPlan) console.error('[claude-agent] Running in PLAN mode (read-only)');

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
    continue: true,
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

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
const https = require('https');
const http = require('http');

// V1.5 callback mode: stream NDJSON via chunked POST to DO instead of stdout.
// Activated when VF_CALLBACK_URL + VF_STREAM_JWT env vars are set.
const CALLBACK_URL = process.env.VF_CALLBACK_URL || '';
const CALLBACK_JWT = process.env.VF_STREAM_JWT || '';
const IS_CALLBACK_MODE = !!(CALLBACK_URL && CALLBACK_JWT);

let callbackReq = null;

if (IS_CALLBACK_MODE) {
  const parsed = new URL(CALLBACK_URL);
  const transport = parsed.protocol === 'https:' ? https : http;
  callbackReq = transport.request({
    hostname: parsed.hostname,
    port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
    path: parsed.pathname + parsed.search,
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${CALLBACK_JWT}`,
      'Content-Type': 'application/x-ndjson',
      'Transfer-Encoding': 'chunked',
    },
  });
  callbackReq.on('error', (err) => {
    console.error(`[claude-agent] callback POST error: ${err.message}`);
  });
  console.error('[claude-agent] V1.5 callback mode — streaming to DO');
}

// Emit an event object as NDJSON.
// V1.0: synchronous write to stdout (fd 1), bypasses Node's stream buffering.
// V1.5: write to open chunked HTTP POST request to DO callback.
function emit(obj) {
  const line = JSON.stringify(obj) + '\n';
  if (IS_CALLBACK_MODE && callbackReq) {
    callbackReq.write(line);
  } else {
    fs.writeSync(1, line);
  }
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
const BASE_SYSTEM_APPEND = 'You are working in a cloud sandbox (VaporForge). Always create, edit, and manage files in /workspace (your cwd). Never use /tmp unless explicitly asked. After completing any task that involves tool use (writing files, running commands, making edits, etc.), always follow up with a brief text summary of what was done — the user cannot see individual tool calls and has no way to know if the work is complete or if you need more input without a response from you.';
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

// Model fallback chain: when a model hits its usage limit, try the next one.
// Order: sonnet -> haiku -> opus (haiku is cheapest fallback, opus is last resort).
const MODEL_FALLBACK_CHAIN = {
  'claude-sonnet-4-6': 'claude-haiku-4-5-20251001',
  'claude-haiku-4-5-20251001': 'claude-opus-4-6',
  'claude-opus-4-6': null, // no further fallback
};

const MODEL_DISPLAY_NAMES = {
  'claude-sonnet-4-6': 'Sonnet',
  'claude-haiku-4-5-20251001': 'Haiku',
  'claude-opus-4-6': 'Opus',
};

// Detect if an exit-code-1 failure is a rate/usage limit by probing the CLI directly.
// Returns the rate limit message if detected, null otherwise.
function detectRateLimit(env, cwd) {
  try {
    const { execFileSync } = require('child_process');
    execFileSync('claude', ['-p', 'ok', '--max-turns', '1', '--output-format', 'json'], {
      env,
      cwd: cwd || '/workspace',
      encoding: 'utf8',
      timeout: 10000,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return null; // succeeded — not a rate limit
  } catch (probeErr) {
    const stdout = probeErr.stdout ? probeErr.stdout.toString() : '';
    if (stdout.includes('hit your limit') || stdout.includes("you've hit") || stdout.includes('resets')) {
      // Extract the reset message from JSON output
      try {
        const parsed = JSON.parse(stdout);
        if (parsed.result && typeof parsed.result === 'string') {
          return parsed.result;
        }
      } catch {}
      return 'Usage limit reached';
    }
    return null; // different error — not a rate limit
  }
}

// Extract a user-friendly error message from SDK errors
function cleanErrorMessage(err) {
  const raw = err.stack || err.message || String(err);

  // Categorize by exit code pattern
  const exitMatch = raw.match(/process exited with code (\d+)/i);
  if (exitMatch) {
    const code = exitMatch[1];
    if (code === '1') return 'Claude exited with an error. Common causes: usage limit reached (try switching models), auth expired (re-login), or API issue.';
    if (code === '137') return 'Claude process was killed (out of memory). Try a shorter prompt.';
    return `Claude process exited unexpectedly (code ${code}).`;
  }

  // Detect specific SDK / network errors
  if (raw.includes('ECONNREFUSED') || raw.includes('fetch failed'))
    return 'Could not reach Anthropic API. Check your connection and try again.';
  if (raw.includes('401') || /invalid.*token/i.test(raw))
    return 'Authentication failed. Your Claude token may have expired — try logging out and back in.';
  if (raw.includes('rate_limit') || raw.includes('429'))
    return 'Rate limited by Anthropic. Wait a moment and try again.';
  if (raw.includes('overloaded') || raw.includes('529'))
    return 'Anthropic API is overloaded. Try again in a few seconds.';

  // Strip file paths and stack frames for cleaner messages
  const firstLine = raw.split('\n')[0].trim();
  return firstLine.length > 200 ? firstLine.slice(0, 200) + '...' : firstLine;
}

function buildOptions(prompt, sessionId, cwd, useResume, modelOverride) {
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

  // 1M context beta: only for API key users (CLI rejects betas for OAuth with a warning)
  const isOAuth = oauthToken.startsWith('sk-ant-oat');
  const betas = isOAuth ? undefined : ['context-1m-2025-08-07'];

  return {
    model: modelOverride || process.env.VF_MODEL || 'claude-sonnet-4-6',
    ...(betas ? { betas } : {}),
    cwd: cwd || '/workspace',
    // Capture raw CLI stderr — surfaces OAuth/auth errors that cause exit code 1
    stderr: (data) => {
      const line = data.trim();
      if (line) {
        console.error(`[claude-cli-stderr] ${line}`);
      }
    },
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

async function runStream(prompt, sessionId, cwd, useResume, modelOverride) {
  const options = buildOptions(prompt, sessionId, cwd, useResume, modelOverride);

  // Pre-flight: test CLI binary + real query to capture any startup errors
  const { execFileSync } = require('child_process');
  try {
    const ver = execFileSync('claude', ['--version'], {
      env: options.env,
      encoding: 'utf8',
      timeout: 10000,
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
    console.error(`[claude-agent] CLI pre-flight OK: ${ver}`);
  } catch (pfErr) {
    const stderr = pfErr.stderr ? pfErr.stderr.toString().trim() : '';
    const stdout = pfErr.stdout ? pfErr.stdout.toString().trim() : '';
    console.error(`[claude-agent] CLI pre-flight FAILED (code=${pfErr.status}): ${pfErr.message}`);
    if (stderr) console.error(`[claude-agent] CLI pre-flight stderr: ${stderr.slice(0, 500)}`);
    if (stdout) console.error(`[claude-agent] CLI pre-flight stdout: ${stdout.slice(0, 500)}`);
  }

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
      // Log full raw error event to stderr for diagnostics
      console.error(`[claude-agent] SDK_ERROR: ${JSON.stringify(msg).slice(0, 500)}`);
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
  const currentModel = process.env.VF_MODEL || 'claude-sonnet-4-6';
  let result;

  try {
    // First attempt: resume existing session if we have a sessionId
    result = await runStream(prompt, sessionId, cwd, !!sessionId);
  } catch (err) {
    // Log raw error to stderr for server-side debugging (visible in wrangler tail)
    console.error(`[claude-agent] RAW_ERROR sessionId=${sessionId?.slice(0, 8) || 'none'}: ${err.stack || err.message}`);
    // Dump all non-standard error properties (SDK may attach stderr, exitCode, etc.)
    const extraProps = Object.getOwnPropertyNames(err).filter(k => !['message', 'stack', 'name'].includes(k));
    if (extraProps.length > 0) {
      for (const k of extraProps) {
        const v = err[k];
        const s = typeof v === 'string' ? v : JSON.stringify(v);
        console.error(`[claude-agent] ERR_PROP ${k}=${String(s).slice(0, 500)}`);
      }
    }

    const raw = err.stack || err.message || String(err);
    const isExitCode1 = /process exited with code 1/i.test(raw);

    // Check for rate/usage limit on exit code 1 — auto-fallback to next model
    if (isExitCode1) {
      const rateLimitMsg = detectRateLimit(
        { ...process.env, CLAUDE_CODE_OAUTH_TOKEN: process.env.CLAUDE_CODE_OAUTH_TOKEN || '' },
        cwd
      );

      if (rateLimitMsg) {
        const failedModel = currentModel;
        const nextModel = MODEL_FALLBACK_CHAIN[failedModel] || null;
        const failedName = MODEL_DISPLAY_NAMES[failedModel] || failedModel;

        if (nextModel) {
          const nextName = MODEL_DISPLAY_NAMES[nextModel] || nextModel;
          console.error(`[claude-agent] Rate limit on ${failedName}, falling back to ${nextName}`);
          emit({
            type: 'model-fallback',
            from: failedName,
            to: nextName,
            reason: rateLimitMsg,
          });

          try {
            // Retry with fallback model (fresh session — no resume)
            result = await runStream(prompt, '', cwd, false, nextModel);
          } catch (fallbackErr) {
            // Fallback also failed — check if THAT model is also rate limited
            const fbRaw = fallbackErr.stack || fallbackErr.message || '';
            if (/process exited with code 1/i.test(fbRaw)) {
              const fbRateLimit = detectRateLimit(
                { ...process.env, CLAUDE_CODE_OAUTH_TOKEN: process.env.CLAUDE_CODE_OAUTH_TOKEN || '' },
                cwd
              );
              if (fbRateLimit) {
                const thirdModel = MODEL_FALLBACK_CHAIN[nextModel] || null;
                if (thirdModel) {
                  const thirdName = MODEL_DISPLAY_NAMES[thirdModel] || thirdModel;
                  console.error(`[claude-agent] Rate limit on ${nextName} too, falling back to ${thirdName}`);
                  emit({ type: 'model-fallback', from: nextName, to: thirdName, reason: fbRateLimit });
                  try {
                    result = await runStream(prompt, '', cwd, false, thirdModel);
                  } catch (thirdErr) {
                    emit({ type: 'error', error: 'All models rate limited. Wait for your usage to reset.' });
                    emit({ type: 'done', sessionId: '', fullText: '' });
                    return;
                  }
                } else {
                  emit({ type: 'error', error: `All models rate limited. ${fbRateLimit}` });
                  emit({ type: 'done', sessionId: '', fullText: '' });
                  return;
                }
              } else {
                emit({ type: 'error', error: cleanErrorMessage(fallbackErr) });
                emit({ type: 'done', sessionId: '', fullText: '' });
                return;
              }
            } else {
              emit({ type: 'error', error: cleanErrorMessage(fallbackErr) });
              emit({ type: 'done', sessionId: '', fullText: '' });
              return;
            }
          }

          // If we got a result from fallback, emit done and return
          if (result) {
            emit({
              type: 'done',
              sessionId: result.newSessionId,
              fullText: result.responseText,
              ...(result.usage ? { usage: result.usage } : {}),
              ...(result.costUsd !== null ? { costUsd: result.costUsd } : {}),
            });
            return;
          }
        } else {
          // No fallback available
          emit({ type: 'error', error: `${failedName} usage limit reached. ${rateLimitMsg}` });
          emit({ type: 'done', sessionId: '', fullText: '' });
          return;
        }
      }
    }

    // Not a rate limit — use standard error handling
    const friendly = cleanErrorMessage(err);

    // If we were trying to resume a session and it crashed, retry fresh
    if (sessionId) {
      emit({
        type: 'error',
        error: `Session resume failed: ${friendly}. Starting fresh session...`,
      });
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

// Finalize the callback POST (V1.5 mode) — close the chunked request body.
function finalizeCallback() {
  if (IS_CALLBACK_MODE && callbackReq) {
    callbackReq.end();
  }
}

// Read arguments from command line OR context file (V1.5 mode).
// V1.0: args come from CLI  (ws-agent-server.js passes prompt, sessionId, cwd)
// V1.5: startProcess has no CLI args, prompt is in /tmp/vf-pending-query.json
const CONTEXT_FILE = '/tmp/vf-pending-query.json';
const args = process.argv.slice(2);

let prompt, sessionId, cwd;

if (args.length >= 1) {
  // V1.0 mode: CLI arguments
  [prompt, sessionId, cwd] = args;
} else if (IS_CALLBACK_MODE && fs.existsSync(CONTEXT_FILE)) {
  // V1.5 mode: read from context file written by ChatSessionAgent.dispatchContainer
  try {
    const ctx = JSON.parse(fs.readFileSync(CONTEXT_FILE, 'utf8'));
    prompt = ctx.prompt;
    sessionId = ctx.sdkSessionId || '';
    cwd = '/workspace';
    // Delete context file after reading (one-shot)
    fs.unlinkSync(CONTEXT_FILE);
    console.error(`[claude-agent] V1.5: read prompt from context file (${prompt.length} chars)`);
  } catch (err) {
    console.error(`[claude-agent] Failed to read context file: ${err.message}`);
    emit({ type: 'error', error: 'Failed to read query context' });
    finalizeCallback();
    process.exit(1);
  }
} else {
  console.error(JSON.stringify({
    type: 'error',
    error: 'Usage: node claude-agent.js <prompt> [sessionId] [cwd]'
  }));
  process.exit(1);
}

handleQuery(prompt, sessionId, cwd).then(() => {
  finalizeCallback();
}).catch(err => {
  // Output clean error to stdout/callback (parsed by backend)
  const friendly = cleanErrorMessage(err);
  emit({ type: 'error', error: friendly });
  emit({ type: 'done', sessionId: '', fullText: '' });
  finalizeCallback();
  // Log full detail to stderr for server-side debugging only
  console.error(`[claude-agent] fatal: ${err.stack || err.message || err}`);
  // Exit cleanly (code 0) — errors are already reported via protocol.
  process.exit(0);
});

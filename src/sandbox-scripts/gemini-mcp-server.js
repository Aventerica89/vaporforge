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
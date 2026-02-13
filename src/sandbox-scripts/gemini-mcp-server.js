#!/usr/bin/env node

// Gemini MCP Server — runs inside the Cloudflare Sandbox container.
// Zero-dependency MCP server using JSON-RPC 2.0 over stdin/stdout.
// Reads GEMINI_API_KEY from env. Calls Gemini REST API via Node https.
//
// Tools:
//   gemini_quick_query    — Gemini 2.0 Flash for fast Q&A
//   gemini_analyze_code   — Gemini 2.0 Pro for code review/analysis
//   gemini_codebase_analysis — Gemini 2.0 Pro with file reading

const https = require('https');
const fs = require('fs');
const path = require('path');

const API_KEY = process.env.GEMINI_API_KEY || '';
const API_HOST = 'generativelanguage.googleapis.com';
const MODELS = {
  flash: 'gemini-2.0-flash',
  pro: 'gemini-2.5-pro-preview-06-05',
};

// Allowed directories for file reading (security boundary)
const ALLOWED_ROOTS = ['/workspace', '/root'];

// ── Tool definitions ──

const TOOLS = [
  {
    name: 'gemini_quick_query',
    description: 'Ask Google Gemini a quick question. Uses Gemini 2.0 Flash for fast responses. Good for explanations, brainstorming, quick code snippets, and general Q&A.',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'The question or prompt to send to Gemini',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'gemini_analyze_code',
    description: 'Send code to Google Gemini for deep analysis. Uses Gemini 2.0 Pro for thorough review. Good for security audits, performance review, architecture analysis, and refactoring suggestions.',
    inputSchema: {
      type: 'object',
      properties: {
        code: {
          type: 'string',
          description: 'The code to analyze',
        },
        language: {
          type: 'string',
          description: 'Programming language (e.g. typescript, python)',
        },
        focus: {
          type: 'string',
          description: 'Analysis focus: security, performance, architecture, refactoring, bugs, or general',
          enum: ['security', 'performance', 'architecture', 'refactoring', 'bugs', 'general'],
        },
      },
      required: ['code'],
    },
  },
  {
    name: 'gemini_codebase_analysis',
    description: 'Analyze multiple files from the workspace using Google Gemini. Reads files from disk and sends them to Gemini 2.0 Pro for cross-file analysis. Good for architecture review, dependency analysis, and finding patterns across files.',
    inputSchema: {
      type: 'object',
      properties: {
        file_paths: {
          type: 'array',
          items: { type: 'string' },
          description: 'Array of absolute file paths to read and analyze (must be under /workspace or /root)',
        },
        question: {
          type: 'string',
          description: 'What to analyze about these files',
        },
      },
      required: ['file_paths', 'question'],
    },
  },
];

// ── Gemini API call ──

function callGemini(model, prompt) {
  return new Promise((resolve, reject) => {
    const apiPath = `/v1beta/models/${model}:generateContent?key=${API_KEY}`;
    const payload = JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        maxOutputTokens: 8192,
        temperature: 0.7,
      },
    });

    const req = https.request(
      {
        hostname: API_HOST,
        path: apiPath,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
        },
        timeout: 120000,
      },
      (res) => {
        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => {
          const raw = Buffer.concat(chunks).toString();
          try {
            const data = JSON.parse(raw);
            if (data.error) {
              reject(new Error(data.error.message || 'Gemini API error'));
              return;
            }
            const text =
              data.candidates?.[0]?.content?.parts?.[0]?.text || '';
            resolve(text);
          } catch {
            reject(new Error('Failed to parse Gemini response'));
          }
        });
      }
    );

    req.on('error', (err) => reject(err));
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Gemini API request timed out'));
    });
    req.write(payload);
    req.end();
  });
}

// ── File reading (for codebase_analysis) ──

function isPathAllowed(filePath) {
  const resolved = path.resolve(filePath);
  return ALLOWED_ROOTS.some((root) => resolved.startsWith(root));
}

function readFilesSafe(filePaths) {
  const results = [];
  for (const fp of filePaths) {
    if (!isPathAllowed(fp)) {
      results.push({ path: fp, error: 'Path not allowed (must be under /workspace or /root)' });
      continue;
    }
    try {
      const content = fs.readFileSync(fp, 'utf8');
      results.push({ path: fp, content });
    } catch (err) {
      results.push({ path: fp, error: err.message });
    }
  }
  return results;
}

// ── Tool handlers ──

async function handleToolCall(name, args) {
  if (!API_KEY) {
    return { isError: true, content: [{ type: 'text', text: 'GEMINI_API_KEY not configured. Add it in Settings > AI Providers.' }] };
  }

  switch (name) {
    case 'gemini_quick_query': {
      const text = await callGemini(MODELS.flash, args.query);
      return { content: [{ type: 'text', text }] };
    }

    case 'gemini_analyze_code': {
      const lang = args.language || 'unknown';
      const focus = args.focus || 'general';
      const prompt = [
        `Analyze the following ${lang} code. Focus: ${focus}.`,
        'Provide specific, actionable feedback.',
        '',
        '```' + lang,
        args.code,
        '```',
      ].join('\n');
      const text = await callGemini(MODELS.pro, prompt);
      return { content: [{ type: 'text', text }] };
    }

    case 'gemini_codebase_analysis': {
      const files = readFilesSafe(args.file_paths || []);
      const fileBlocks = files.map((f) => {
        if (f.error) return `--- ${f.path} ---\n[Error: ${f.error}]`;
        return `--- ${f.path} ---\n${f.content}`;
      });
      const prompt = [
        args.question,
        '',
        'Files:',
        '',
        ...fileBlocks,
      ].join('\n');
      const text = await callGemini(MODELS.pro, prompt);
      return { content: [{ type: 'text', text }] };
    }

    default:
      return { isError: true, content: [{ type: 'text', text: `Unknown tool: ${name}` }] };
  }
}

// ── JSON-RPC 2.0 / MCP protocol ──

function makeResponse(id, result) {
  return JSON.stringify({ jsonrpc: '2.0', id, result });
}

function makeError(id, code, message) {
  return JSON.stringify({ jsonrpc: '2.0', id, error: { code, message } });
}

async function handleMessage(msg) {
  const { id, method, params } = msg;

  switch (method) {
    case 'initialize':
      return makeResponse(id, {
        protocolVersion: '2024-11-05',
        capabilities: { tools: {} },
        serverInfo: { name: 'gemini-mcp-server', version: '1.0.0' },
      });

    case 'notifications/initialized':
      // No response needed for notifications
      return null;

    case 'tools/list':
      return makeResponse(id, { tools: TOOLS });

    case 'tools/call': {
      const toolName = params?.name;
      const toolArgs = params?.arguments || {};
      try {
        const result = await handleToolCall(toolName, toolArgs);
        return makeResponse(id, result);
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        return makeResponse(id, {
          isError: true,
          content: [{ type: 'text', text: `Gemini error: ${errMsg}` }],
        });
      }
    }

    case 'ping':
      return makeResponse(id, {});

    default:
      return makeError(id, -32601, `Method not found: ${method}`);
  }
}

// ── stdin/stdout transport ──

let buffer = '';

process.stdin.setEncoding('utf8');
process.stdin.on('data', async (chunk) => {
  buffer += chunk;

  // Process complete JSON-RPC messages (newline-delimited)
  const lines = buffer.split('\n');
  buffer = lines.pop() || '';

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    try {
      const msg = JSON.parse(trimmed);
      const response = await handleMessage(msg);
      if (response) {
        process.stdout.write(response + '\n');
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      process.stderr.write(`[gemini-mcp] Parse error: ${errMsg}\n`);
    }
  }
});

process.stdin.on('end', () => {
  process.exit(0);
});

process.stderr.write('[gemini-mcp] Server started\n');

#!/usr/bin/env node

// Sentinel background agent — predictive co-pilot briefing.
// Runs every 5 min while sentinel is active, writes a structured briefing to
// /workspace/.vf-sentinel-report.md. The frontend emits a glow event so the
// user can click to send the briefing to Claude on demand (no auto-inject).
//
// Providers (in priority order):
//   1. DeepSeek V3 (DEEPSEEK_API_KEY) — strong code reasoning
//   2. Groq / Llama 3.3 70B (GROQ_API_KEY) — fast fallback
//
// No npm deps — uses native Node 18+ fetch for the API call.

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const REPORT_PATH = '/workspace/.vf-sentinel-report.md';
const WORKSPACE = '/workspace';
const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
const DEEPSEEK_API_URL = 'https://api.deepseek.com/v1/chat/completions';
const GROQ_MODEL = 'llama-3.3-70b-versatile';
const DEEPSEEK_MODEL = 'deepseek-chat';
const MAX_CONTEXT_CHARS = 14000;

const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;
const GROQ_API_KEY = process.env.GROQ_API_KEY;

async function main() {
  if (!DEEPSEEK_API_KEY && !GROQ_API_KEY) {
    console.log('[sentinel-agent] no DEEPSEEK_API_KEY or GROQ_API_KEY — skipping');
    process.exit(0);
  }

  const provider = DEEPSEEK_API_KEY ? 'deepseek' : 'groq';
  console.log(`[sentinel-agent] briefing generation starting (provider: ${provider})`);

  const context = gatherContext();

  if (!context.trim()) {
    console.log('[sentinel-agent] no workspace context gathered — skipping');
    process.exit(0);
  }

  const report = await callProvider(provider, context);
  if (!report) {
    process.exit(0);
  }

  const output = `# Sentinel Briefing\n*${new Date().toISOString()} · provider: ${provider}*\n\n${report}\n`;
  fs.writeFileSync(REPORT_PATH, output, 'utf8');
  console.log(`[sentinel-agent] briefing written (${output.length} chars)`);
  process.exit(0);
}

function gatherContext() {
  let ctx = '';

  // Current branch name
  ctx += tryExec(() => {
    const branch = execFileSync('git', ['branch', '--show-current'], { cwd: WORKSPACE, encoding: 'utf8', timeout: 5000 }).trim();
    return branch ? `## Branch\n\`${branch}\`\n\n` : '';
  });

  // Uncommitted changes (short status)
  ctx += tryExec(() => {
    const out = execFileSync('git', ['status', '--short'], { cwd: WORKSPACE, encoding: 'utf8', timeout: 5000 });
    return out.trim() ? `## Uncommitted changes\n\`\`\`\n${out.slice(0, 1500)}\n\`\`\`\n\n` : '';
  });

  // Recent commits
  ctx += tryExec(() => {
    const out = execFileSync('git', ['log', '--oneline', '-5'], { cwd: WORKSPACE, encoding: 'utf8', timeout: 5000 });
    return out.trim() ? `## Recent commits\n\`\`\`\n${out}\n\`\`\`\n\n` : '';
  });

  // Actual diffs (signal-dense, much better than raw file contents)
  ctx += tryExec(() => {
    const diff = execFileSync('git', ['diff', 'HEAD~5', '--unified=3', '--'], { cwd: WORKSPACE, encoding: 'utf8', timeout: 10000 });
    if (!diff.trim()) return '';
    const capped = diff.slice(0, 6000);
    const truncated = diff.length > 6000 ? '\n...(diff truncated)' : '';
    return `## Recent diffs (HEAD~5)\n\`\`\`diff\n${capped}${truncated}\n\`\`\`\n\n`;
  });

  // TODO/FIXME in source files
  ctx += tryExec(() => {
    const out = execFileSync(
      'grep', ['-r', '--include=*.ts', '--include=*.tsx', '--include=*.js', '-n',
        'TODO\\|FIXME\\|HACK\\|XXX', WORKSPACE],
      { encoding: 'utf8', timeout: 5000 }
    );
    const lines = out.trim().split('\n').slice(0, 20).join('\n');
    return lines ? `## TODO/FIXME\n\`\`\`\n${lines}\n\`\`\`\n\n` : '';
  });

  return ctx.length > MAX_CONTEXT_CHARS ? ctx.slice(0, MAX_CONTEXT_CHARS) + '\n...(truncated)' : ctx;
}

async function callProvider(provider, context) {
  const system = `You are a predictive coding co-pilot preparing a briefing for a Claude session about to start.
Given the workspace snapshot, answer THREE questions:
1. What changed recently? (summarize the diffs and recent commits in 2-3 sentences)
2. What is the developer probably about to work on next? (infer from branch name, uncommitted changes, TODOs)
3. Anything concerning? (bugs, security issues, stale TODOs — only if genuinely important)

Keep the briefing under 300 words. Use markdown with file:line refs.
Sections: ## What Changed | ## Likely Next | ## Watch Out
If nothing concerning, omit the Watch Out section entirely.`;

  const user = `Workspace snapshot:\n\n${context}\n\nWrite the predictive briefing.`;

  const url = provider === 'deepseek' ? DEEPSEEK_API_URL : GROQ_API_URL;
  const apiKey = provider === 'deepseek' ? DEEPSEEK_API_KEY : GROQ_API_KEY;
  const model = provider === 'deepseek' ? DEEPSEEK_MODEL : GROQ_MODEL;

  let resp;
  try {
    resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
        max_tokens: 500,
        temperature: 0.2,
      }),
    });
  } catch (err) {
    console.error(`[sentinel-agent] fetch failed (${provider}): ${err.message}`);
    return null;
  }

  if (!resp.ok) {
    const body = await resp.text().catch(() => '');
    console.error(`[sentinel-agent] API ${resp.status} (${provider}): ${body.slice(0, 200)}`);
    return null;
  }

  const data = await resp.json().catch(() => null);
  return data?.choices?.[0]?.message?.content || null;
}

function tryExec(fn) {
  try { return fn() || ''; } catch { return ''; }
}

main().catch((err) => {
  console.error('[sentinel-agent] fatal:', err.message);
  process.exit(1);
});

# Agency Code Mode Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a Code Mode toggle to Agency Editor that splits the center column into a live preview (top) and dual Monaco editors (bottom: .astro file + CSS file), with an Inline AI chat that streams generated CSS/HTML directly into the active editor with 1s debounced auto-save.

**Architecture:** A `</>` toolbar button flips `codeMode` state in `AgencyEditor.tsx`. In Code Mode, the center column uses `react-resizable-panels` for a vertical split (preview top, `AgencyCodePane` bottom). The right panel swaps `EditPanel` for `AgencyInlineAI`. Three new backend endpoints handle file read, file write, and a lightweight `streamText` call (no agent, no tools).

**Tech Stack:** React 18, Monaco (`@monaco-editor/react`), `react-resizable-panels`, Vercel AI SDK `streamText`, Hono, Cloudflare Sandboxes.

**Design doc:** `docs/plans/2026-02-19-agency-code-mode-design.md`

---

### Task 1: Install react-resizable-panels

**Files:**
- Modify: `package.json`

**Step 1: Install the package**

```bash
cd ~/vaporforge
npm install react-resizable-panels
```

**Step 2: Verify it imported cleanly**

```bash
grep "react-resizable-panels" package.json
```

Expected: `"react-resizable-panels": "^2.x.x"` in dependencies.

**Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "feat(agency): install react-resizable-panels"
```

---

### Task 2: Backend — GET file endpoint

**Files:**
- Modify: `src/api/agency.ts` (add after the `/sites/:id/diff` route, around line 370)

**Step 1: Add the route**

Find the diff route block and add immediately after it:

```typescript
// Read a file from the agency sandbox
agencyRoutes.get('/sites/:id/file', async (c) => {
  const user = c.get('user');
  const siteId = c.req.param('id');
  const filePath = c.req.query('path');

  if (!filePath) {
    return c.json<ApiResponse<never>>({ success: false, error: 'path is required' }, 400);
  }

  // Sanitize: must be a relative path under /workspace
  const safePath = filePath.startsWith('/') ? filePath : `/workspace/${filePath}`;

  const sm = getSandboxManager(c.env);
  const sessionId = `agency-${siteId}`;

  // Verify site belongs to user
  const site = await c.env.SESSIONS_KV.get(`agency-site:${user.id}:${siteId}`);
  if (!site) {
    return c.json<ApiResponse<never>>({ success: false, error: 'Site not found' }, 404);
  }

  const content = await sm.readFile(sessionId, safePath);
  if (content === null) {
    return c.json<ApiResponse<never>>({ success: false, error: 'File not found' }, 404);
  }

  return c.json<ApiResponse<{ content: string; path: string }>>({
    success: true,
    data: { content, path: safePath },
  });
});
```

**Step 2: Verify TypeScript compiles**

```bash
cd ~/vaporforge && npx tsc --noEmit 2>&1 | grep "agency"
```

Expected: no errors in agency.ts.

**Step 3: Commit**

```bash
git add src/api/agency.ts
git commit -m "feat(agency): GET /sites/:id/file — read file from sandbox"
```

---

### Task 3: Backend — PUT file endpoint

**Files:**
- Modify: `src/api/agency.ts` (add after the GET file route from Task 2)

**Step 1: Add the route**

```typescript
// Write a file to the agency sandbox
agencyRoutes.put('/sites/:id/file', async (c) => {
  const user = c.get('user');
  const siteId = c.req.param('id');

  const body = await c.req.json().catch(() => null);
  const filePath: string = body?.path;
  const content: string = body?.content;

  if (!filePath || content === undefined) {
    return c.json<ApiResponse<never>>(
      { success: false, error: 'path and content are required' },
      400,
    );
  }

  const safePath = filePath.startsWith('/') ? filePath : `/workspace/${filePath}`;

  const sm = getSandboxManager(c.env);
  const sessionId = `agency-${siteId}`;

  const site = await c.env.SESSIONS_KV.get(`agency-site:${user.id}:${siteId}`);
  if (!site) {
    return c.json<ApiResponse<never>>({ success: false, error: 'Site not found' }, 404);
  }

  const ok = await sm.writeFile(sessionId, safePath, content);
  if (!ok) {
    return c.json<ApiResponse<never>>({ success: false, error: 'Write failed' }, 500);
  }

  return c.json<ApiResponse<{ path: string }>>({
    success: true,
    data: { path: safePath },
  });
});
```

**Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit 2>&1 | grep "agency"
```

Expected: no errors.

**Step 3: Commit**

```bash
git add src/api/agency.ts
git commit -m "feat(agency): PUT /sites/:id/file — write file to sandbox"
```

---

### Task 4: Backend — POST inline-ai endpoint

**Files:**
- Modify: `src/api/agency.ts` (add after PUT file route)

This endpoint is a lightweight `streamText` call — no agent, no tools. It receives the current CSS/Astro content + prompt, returns SSE with generated code.

**Step 1: Add imports at top of agency.ts** (if not already present)

Check if `streamText` is already imported from `'ai'`. If not, add it:

```typescript
import { streamText } from 'ai';
import {
  createModel,
  getProviderCredentials,
} from '../services/ai-provider-factory';
```

(These are already imported for the debug endpoint added in v0.26.0 — skip if present.)

**Step 2: Add the SSE helper** (check if `sseEvent` already exists in agency.ts; if not add it near the top of the file, after the imports):

```typescript
function sseEvent(data: Record<string, unknown>): string {
  return `data: ${JSON.stringify(data)}\n\n`;
}
```

**Step 3: Add the inline-ai route**

```typescript
// Inline AI — streams CSS/HTML generation directly into the editor (no agent)
agencyRoutes.post('/sites/:id/inline-ai', async (c) => {
  const user = c.get('user');
  const siteId = c.req.param('id');

  const body = await c.req.json().catch(() => null);
  const prompt: string = body?.prompt;
  const cssContext: string = body?.cssContext ?? '';
  const astroContext: string = body?.astroContext ?? '';
  const targetPane: 'css' | 'astro' = body?.targetPane ?? 'css';
  const elementContext: string = body?.elementContext ?? '';

  if (!prompt) {
    return c.json<ApiResponse<never>>({ success: false, error: 'prompt is required' }, 400);
  }

  const site = await c.env.SESSIONS_KV.get(`agency-site:${user.id}:${siteId}`);
  if (!site) {
    return c.json<ApiResponse<never>>({ success: false, error: 'Site not found' }, 404);
  }

  const creds = await getProviderCredentials(c.env.SESSIONS_KV, user.id, user.claudeToken);

  // Prefer Gemini Flash (fast, cheap, great at CSS). Fall back to Claude Haiku.
  let aiModel;
  try {
    if (creds.geminiApiKey) {
      aiModel = createModel('gemini', creds, 'flash');
    } else if (creds.claudeApiKey) {
      aiModel = createModel('claude', creds, 'haiku');
    } else {
      return c.json<ApiResponse<never>>(
        { success: false, error: 'No AI provider configured. Add a Gemini or Claude API key in Settings.' },
        400,
      );
    }
  } catch {
    return c.json<ApiResponse<never>>({ success: false, error: 'Failed to initialize AI model' }, 500);
  }

  const systemPrompt = targetPane === 'css'
    ? [
        'You are a CSS expert. Generate clean, minimal CSS for the user\'s request.',
        'Return ONLY the CSS code — no explanation, no markdown fences, no comments unless asked.',
        'Prefer modern CSS: custom properties, flexbox, grid, transitions.',
        elementContext ? `Target element context: ${elementContext}` : '',
      ].filter(Boolean).join('\n')
    : [
        'You are an Astro/HTML expert. Generate clean Astro/HTML markup for the user\'s request.',
        'Return ONLY the HTML/Astro code — no explanation, no markdown fences.',
        elementContext ? `Target element context: ${elementContext}` : '',
      ].filter(Boolean).join('\n');

  const userMessage = [
    prompt,
    cssContext ? `\n\nCurrent CSS:\n${cssContext.slice(0, 4000)}` : '',
    astroContext ? `\n\nCurrent Astro file:\n${astroContext.slice(0, 2000)}` : '',
  ].filter(Boolean).join('');

  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  const encoder = new TextEncoder();

  const write = (data: Record<string, unknown>) =>
    writer.write(encoder.encode(sseEvent(data)));

  const streamPromise = (async () => {
    try {
      const result = streamText({
        model: aiModel,
        system: systemPrompt,
        messages: [{ role: 'user', content: userMessage }],
        maxTokens: 2000,
      });

      for await (const chunk of result.textStream) {
        await write({ type: 'text', text: chunk });
      }
      await write({ type: 'done' });
    } catch (err) {
      await write({ type: 'error', error: err instanceof Error ? err.message : 'Generation failed' });
    } finally {
      await writer.close();
    }
  })();

  c.executionCtx.waitUntil(streamPromise);

  return new Response(readable, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
});
```

**Step 4: Verify TypeScript compiles**

```bash
npx tsc --noEmit 2>&1 | grep "agency"
```

Expected: no errors.

**Step 5: Commit**

```bash
git add src/api/agency.ts
git commit -m "feat(agency): POST /sites/:id/inline-ai — lightweight streamText for code editors"
```

---

### Task 5: Create AgencyCodePane component

**Files:**
- Create: `ui/src/components/agency/AgencyCodePane.tsx`

This is the bottom half of Code Mode: two Monaco editors side by side with a drag handle.

**Step 1: Create the file**

```tsx
import { useRef, useCallback, useEffect } from 'react';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import MonacoEditor from '@monaco-editor/react';
import { ChevronDown } from 'lucide-react';

interface AgencyCodePaneProps {
  astroFile: string;
  cssFile: string;
  astroContent: string;
  cssContent: string;
  onAstroChange: (value: string) => void;
  onCssChange: (value: string) => void;
  activePane: 'astro' | 'css';
  onActivePaneChange: (pane: 'astro' | 'css') => void;
  onCollapse: () => void;
}

export function AgencyCodePane({
  astroFile,
  cssFile,
  astroContent,
  cssContent,
  onAstroChange,
  onCssChange,
  activePane,
  onActivePaneChange,
  onCollapse,
}: AgencyCodePaneProps) {
  const astroFileName = astroFile.split('/').pop() ?? 'component.astro';
  const cssFileName = cssFile.split('/').pop() ?? 'styles.css';

  return (
    <div className="flex h-full flex-col bg-zinc-950">
      {/* Tab bar */}
      <div className="flex h-8 shrink-0 items-center border-b border-zinc-700 bg-zinc-900">
        <button
          className={`flex items-center gap-1.5 border-r border-zinc-700 px-3 py-1 text-[11px] transition-colors ${
            activePane === 'astro'
              ? 'bg-zinc-800 text-zinc-200'
              : 'text-zinc-500 hover:text-zinc-300'
          }`}
          onClick={() => onActivePaneChange('astro')}
        >
          <span className="font-mono">{astroFileName}</span>
        </button>
        <button
          className={`flex items-center gap-1.5 border-r border-zinc-700 px-3 py-1 text-[11px] transition-colors ${
            activePane === 'css'
              ? 'bg-zinc-800 text-zinc-200'
              : 'text-zinc-500 hover:text-zinc-300'
          }`}
          onClick={() => onActivePaneChange('css')}
        >
          <span className="font-mono">{cssFileName}</span>
        </button>
        <div className="ml-auto">
          <button
            onClick={onCollapse}
            className="flex items-center gap-1 px-2 py-1 text-[11px] text-zinc-500 hover:text-zinc-300"
            title="Collapse editors (Cmd+Shift+\)"
          >
            <ChevronDown className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Editors */}
      <div className="flex-1 overflow-hidden">
        <PanelGroup direction="horizontal">
          <Panel defaultSize={50} minSize={20}>
            <MonacoEditor
              height="100%"
              language="html"
              value={astroContent}
              onChange={(val) => onAstroChange(val ?? '')}
              theme="vs-dark"
              options={{
                minimap: { enabled: false },
                fontSize: 12,
                lineNumbers: 'on',
                wordWrap: 'on',
                scrollBeyondLastLine: false,
                automaticLayout: true,
              }}
              onMount={() => onActivePaneChange('astro')}
            />
          </Panel>
          <PanelResizeHandle className="w-1 bg-zinc-700 hover:bg-violet-500 cursor-col-resize transition-colors" />
          <Panel defaultSize={50} minSize={20}>
            <MonacoEditor
              height="100%"
              language="css"
              value={cssContent}
              onChange={(val) => onCssChange(val ?? '')}
              theme="vs-dark"
              options={{
                minimap: { enabled: false },
                fontSize: 12,
                lineNumbers: 'on',
                wordWrap: 'on',
                scrollBeyondLastLine: false,
                automaticLayout: true,
              }}
              onMount={() => {}}
            />
          </Panel>
        </PanelGroup>
      </div>
    </div>
  );
}
```

**Step 2: Verify TypeScript compiles**

```bash
cd ~/vaporforge && npx tsc --noEmit 2>&1 | grep "AgencyCodePane"
```

Expected: no errors.

**Step 3: Commit**

```bash
git add ui/src/components/agency/AgencyCodePane.tsx
git commit -m "feat(agency): AgencyCodePane — dual Monaco editors with resize handle"
```

---

### Task 6: Create AgencyInlineAI component

**Files:**
- Create: `ui/src/components/agency/AgencyInlineAI.tsx`

This replaces the EditPanel in Code Mode. Prompt input at bottom, streaming preview above, Apply button to insert into active editor.

**Step 1: Create the file**

```tsx
import { useState, useRef, useCallback } from 'react';
import { Send, Check, ChevronRight } from 'lucide-react';

interface AgencyInlineAIProps {
  siteId: string | null;
  activePane: 'astro' | 'css';
  cssContext: string;
  astroContext: string;
  elementContext: string;
  onInsert: (pane: 'astro' | 'css', text: string) => void;
}

export function AgencyInlineAI({
  siteId,
  activePane,
  cssContext,
  astroContext,
  elementContext,
  onInsert,
}: AgencyInlineAIProps) {
  const [prompt, setPrompt] = useState('');
  const [generatedText, setGeneratedText] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [applied, setApplied] = useState(false);
  const targetPaneRef = useRef<'astro' | 'css'>(activePane);

  // Track which pane was active when generation started
  const handleGenerate = useCallback(async () => {
    if (!prompt.trim() || !siteId || isGenerating) return;
    setIsGenerating(true);
    setGeneratedText('');
    setError(null);
    setApplied(false);
    targetPaneRef.current = activePane;

    try {
      const token = localStorage.getItem('session_token');
      const res = await fetch(`/api/agency/sites/${siteId}/inline-ai`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          prompt,
          cssContext,
          astroContext,
          targetPane: activePane,
          elementContext,
        }),
      });

      if (!res.ok) {
        const json = await res.json().catch(() => null);
        throw new Error(json?.error ?? `Request failed (${res.status})`);
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error('No response stream');

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const msg = JSON.parse(line.slice(6));
            if (msg.type === 'text' && msg.text) {
              setGeneratedText((prev) => prev + msg.text);
            } else if (msg.type === 'error') {
              setError(msg.error);
            }
          } catch {}
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Generation failed');
    } finally {
      setIsGenerating(false);
    }
  }, [prompt, siteId, activePane, cssContext, astroContext, elementContext, isGenerating]);

  const handleApply = useCallback(() => {
    if (!generatedText) return;
    onInsert(targetPaneRef.current, generatedText);
    setApplied(true);
  }, [generatedText, onInsert]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleGenerate();
    }
  };

  return (
    <div className="flex h-full flex-col border-l border-zinc-700 bg-zinc-900">
      {/* Header */}
      <div className="flex h-9 shrink-0 items-center justify-between border-b border-zinc-700 px-3">
        <span className="text-[11px] font-medium text-zinc-400">Inline AI</span>
        <span
          className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
            activePane === 'css'
              ? 'bg-blue-900/50 text-blue-400'
              : 'bg-violet-900/50 text-violet-400'
          }`}
        >
          {activePane === 'css' ? 'CSS' : 'Astro'}
        </span>
      </div>

      {/* Generated output */}
      <div className="flex-1 overflow-auto p-3">
        {error ? (
          <div className="rounded-md bg-red-900/30 p-2 text-[11px] text-red-400">{error}</div>
        ) : generatedText ? (
          <pre className="whitespace-pre-wrap font-mono text-[11px] leading-relaxed text-zinc-300">
            {generatedText}
          </pre>
        ) : (
          <div className="flex h-full items-center justify-center text-[11px] text-zinc-600">
            {activePane === 'css'
              ? 'Describe the CSS you want — shadows, hover states, animations...'
              : 'Describe the HTML/Astro markup you want...'}
          </div>
        )}
      </div>

      {/* Apply button */}
      {generatedText && !isGenerating && (
        <div className="border-t border-zinc-700 px-3 py-2">
          <button
            onClick={handleApply}
            className={`flex w-full items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-[12px] font-medium transition-colors ${
              applied
                ? 'bg-emerald-800 text-emerald-200'
                : 'bg-violet-600 text-white hover:bg-violet-500'
            }`}
          >
            {applied ? (
              <>
                <Check className="h-3.5 w-3.5" />
                Applied
              </>
            ) : (
              <>
                <ChevronRight className="h-3.5 w-3.5" />
                Apply to {targetPaneRef.current === 'css' ? 'CSS' : 'Astro'}
              </>
            )}
          </button>
        </div>
      )}

      {/* Prompt input */}
      <div className="border-t border-zinc-700 p-2">
        <div className="flex items-end gap-1.5 rounded-md border border-zinc-600 bg-zinc-800 px-2 py-1.5 focus-within:border-violet-500">
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              activePane === 'css'
                ? 'Add box shadow, hover effect...'
                : 'Add a new section, button...'
            }
            rows={2}
            className="flex-1 resize-none bg-transparent text-[12px] text-zinc-200 placeholder-zinc-600 outline-none"
          />
          <button
            onClick={handleGenerate}
            disabled={!prompt.trim() || isGenerating || !siteId}
            className="shrink-0 rounded p-1 text-violet-400 hover:text-violet-300 disabled:opacity-40"
            title="Generate (Cmd+Enter)"
          >
            <Send className="h-3.5 w-3.5" />
          </button>
        </div>
        <p className="mt-1 text-[10px] text-zinc-600">Cmd+Enter to generate</p>
      </div>
    </div>
  );
}
```

**Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit 2>&1 | grep "AgencyInlineAI"
```

Expected: no errors.

**Step 3: Commit**

```bash
git add ui/src/components/agency/AgencyInlineAI.tsx
git commit -m "feat(agency): AgencyInlineAI — inline AI chat for Code Mode editors"
```

---

### Task 7: Update AgencyEditor — wire up Code Mode

**Files:**
- Modify: `ui/src/components/agency/AgencyEditor.tsx`

This is the largest task. Add `codeMode` state, toolbar button, keyboard shortcuts, vertical panel split, file loading, and auto-save.

**Step 1: Add new imports at top of AgencyEditor.tsx**

After the existing imports, add:

```tsx
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import { Code2 } from 'lucide-react';
import { AgencyCodePane } from './AgencyCodePane';
import { AgencyInlineAI } from './AgencyInlineAI';
```

Also add `Code2` to the existing lucide-react import line (alongside `Bug`, `Rocket`, etc.).

**Step 2: Add new state variables** (after the existing `useState` declarations, around line 57):

```tsx
const [codeMode, setCodeMode] = useState(false);
const [codePaneCollapsed, setCodePaneCollapsed] = useState(false);
const [activePane, setActivePane] = useState<'astro' | 'css'>('astro');
const [astroContent, setAstroContent] = useState('');
const [cssContent, setCssContent] = useState('');
const [astroFile, setAstroFile] = useState('');
const [cssFile, setCssFile] = useState('src/styles/global.css');
const astroSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
const cssSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
```

**Step 3: Add file loading helper** (add before the `return` statement):

```tsx
const loadFilesForComponent = useCallback(
  async (componentFile: string) => {
    if (!editingSiteId) return;
    const token = localStorage.getItem('session_token');

    // Load .astro file
    try {
      const res = await fetch(
        `/api/agency/sites/${editingSiteId}/file?path=${encodeURIComponent(componentFile)}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (res.ok) {
        const json = await res.json();
        setAstroContent(json.data.content);
        setAstroFile(componentFile);
      }
    } catch {}

    // Load CSS file — try scoped first, fall back to global.css
    const baseName = componentFile.split('/').pop()?.replace('.astro', '') ?? '';
    const cssPath = `src/styles/${baseName}.css`;
    const fallbackCssPath = 'src/styles/global.css';

    try {
      const cssRes = await fetch(
        `/api/agency/sites/${editingSiteId}/file?path=${encodeURIComponent(cssPath)}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (cssRes.ok) {
        const json = await cssRes.json();
        setCssContent(json.data.content);
        setCssFile(cssPath);
      } else {
        // Fall back to global.css
        const globalRes = await fetch(
          `/api/agency/sites/${editingSiteId}/file?path=${encodeURIComponent(fallbackCssPath)}`,
          { headers: { Authorization: `Bearer ${token}` } },
        );
        if (globalRes.ok) {
          const json = await globalRes.json();
          setCssContent(json.data.content);
          setCssFile(fallbackCssPath);
        }
      }
    } catch {}
  },
  [editingSiteId],
);
```

**Step 4: Add auto-save helpers** (add after `loadFilesForComponent`):

```tsx
const saveFile = useCallback(
  async (path: string, content: string) => {
    if (!editingSiteId) return;
    const token = localStorage.getItem('session_token');
    try {
      await fetch(`/api/agency/sites/${editingSiteId}/file`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ path, content }),
      });
    } catch {}
  },
  [editingSiteId],
);

const handleAstroChange = useCallback(
  (value: string) => {
    setAstroContent(value);
    if (astroSaveTimer.current) clearTimeout(astroSaveTimer.current);
    astroSaveTimer.current = setTimeout(() => saveFile(astroFile, value), 1000);
  },
  [astroFile, saveFile],
);

const handleCssChange = useCallback(
  (value: string) => {
    setCssContent(value);
    if (cssSaveTimer.current) clearTimeout(cssSaveTimer.current);
    cssSaveTimer.current = setTimeout(() => saveFile(cssFile, value), 1000);
  },
  [cssFile, saveFile],
);

const handleInlineAIInsert = useCallback(
  (pane: 'astro' | 'css', text: string) => {
    if (pane === 'css') {
      const newContent = cssContent + '\n\n' + text;
      setCssContent(newContent);
      saveFile(cssFile, newContent);
    } else {
      const newContent = astroContent + '\n\n' + text;
      setAstroContent(newContent);
      saveFile(astroFile, newContent);
    }
  },
  [cssContent, astroContent, cssFile, astroFile, saveFile],
);
```

**Step 5: Load files when code mode activates or component changes**

Find the existing `useEffect` for `previewUrl` (around line 167) and add a NEW `useEffect` after it:

```tsx
// Load files when code mode is activated and a component is selected
useEffect(() => {
  if (codeMode && selectedComponent?.file) {
    loadFilesForComponent(selectedComponent.file);
  }
}, [codeMode, selectedComponent?.file, loadFilesForComponent]);
```

**Step 6: Add keyboard shortcuts**

Find the existing Escape key `useEffect` (around line 204) and extend it:

```tsx
useEffect(() => {
  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') { closeEditor(); return; }
    if (e.metaKey || e.ctrlKey) {
      if (e.shiftKey && e.key === 'E') { e.preventDefault(); setCodeMode((v) => !v); return; }
      if (e.shiftKey && e.key === '\\') { e.preventDefault(); setCodePaneCollapsed((v) => !v); return; }
    }
    if (e.key === '\\' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); setTreeVisible((v) => !v); }
  };
  window.addEventListener('keydown', handleKeyDown);
  return () => window.removeEventListener('keydown', handleKeyDown);
}, [closeEditor]);
```

**Step 7: Add the `</>` toolbar button**

In the toolbar's right-side controls `<div className="ml-auto flex items-center gap-1">`, add the Code Mode button BEFORE the existing Debug button:

```tsx
{previewUrl && (
  <button
    onClick={() => setCodeMode((v) => !v)}
    className={`flex items-center gap-1 rounded px-2 py-1 text-[11px] hover:bg-zinc-800 ${
      codeMode ? 'bg-zinc-700 text-violet-400' : 'text-zinc-400 hover:text-zinc-200'
    }`}
    title="Toggle Code Mode (Cmd+Shift+E)"
  >
    <Code2 className="h-3.5 w-3.5" />
    <span>Code</span>
  </button>
)}
```

**Step 8: Replace the iframe area with the split layout**

Find the `{/* Iframe area */}` section (the `<div className="flex flex-1 items-center...">` block, around line 468). Replace it entirely with:

```tsx
{/* Center: preview + optional code editors */}
<div className="flex flex-1 flex-col overflow-hidden">
  {isLoading ? (
    <div className="flex flex-1 items-center justify-center">
      <AgencyLoadingScreen statusMessage={loadingMessage} />
    </div>
  ) : error ? (
    <div className="flex flex-1 items-center justify-center">
      <div className="flex max-w-md flex-col items-center gap-3 text-center">
        <span className="text-sm text-red-400">{error}</span>
        <button
          onClick={closeEditor}
          className="rounded-md bg-zinc-800 px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-700"
        >
          Back to Dashboard
        </button>
      </div>
    </div>
  ) : previewUrl ? (
    codeMode ? (
      <PanelGroup direction="vertical">
        <Panel defaultSize={55} minSize={20}>
          <div className="flex h-full items-center justify-center overflow-hidden bg-zinc-950 p-2">
            <div
              className="h-full transition-all duration-300"
              style={{ width: VIEWPORT_WIDTHS[viewport], maxWidth: '100%' }}
            >
              <iframe
                ref={iframeRef}
                src={previewUrl}
                className="h-full w-full rounded-md border border-zinc-800 bg-white"
                sandbox="allow-scripts allow-same-origin"
              />
            </div>
          </div>
        </Panel>
        {!codePaneCollapsed && (
          <>
            <PanelResizeHandle className="h-1.5 bg-zinc-700 hover:bg-violet-500 cursor-row-resize transition-colors" />
            <Panel defaultSize={45} minSize={15}>
              <AgencyCodePane
                astroFile={astroFile}
                cssFile={cssFile}
                astroContent={astroContent}
                cssContent={cssContent}
                onAstroChange={handleAstroChange}
                onCssChange={handleCssChange}
                activePane={activePane}
                onActivePaneChange={setActivePane}
                onCollapse={() => setCodePaneCollapsed(true)}
              />
            </Panel>
          </>
        )}
        {codePaneCollapsed && (
          <button
            onClick={() => setCodePaneCollapsed(false)}
            className="flex h-6 w-full items-center justify-center border-t border-zinc-700 bg-zinc-900 text-[10px] text-zinc-500 hover:text-zinc-300"
          >
            Show editors
          </button>
        )}
      </PanelGroup>
    ) : (
      <div className="flex flex-1 items-center justify-center overflow-hidden bg-zinc-950 p-2">
        <div
          className="h-full transition-all duration-300"
          style={{ width: VIEWPORT_WIDTHS[viewport], maxWidth: '100%' }}
        >
          <iframe
            ref={iframeRef}
            src={previewUrl}
            className="h-full w-full rounded-md border border-zinc-800 bg-white"
            sandbox="allow-scripts allow-same-origin"
          />
        </div>
      </div>
    )
  ) : null}
</div>
```

**Step 9: Swap EditPanel / AgencyInlineAI in the right panel**

Find `{/* Edit Panel (right sidebar) */}` and replace the `<EditPanel .../>` render with:

```tsx
{/* Right panel: Edit (Chat Mode) or Inline AI (Code Mode) */}
{codeMode ? (
  <div className="w-72 shrink-0">
    <AgencyInlineAI
      siteId={editingSiteId}
      activePane={activePane}
      cssContext={cssContent}
      astroContext={astroContent}
      elementContext={selectedComponent?.elementHTML ?? ''}
      onInsert={handleInlineAIInsert}
    />
  </div>
) : (
  <EditPanel
    selectedComponent={selectedComponent}
    siteId={editingSiteId}
    onSendEdit={handleSendEdit}
    isStreaming={isStreaming}
    streamingOutput={streamingOutput}
  />
)}
```

**Step 10: Verify TypeScript compiles**

```bash
npx tsc --noEmit 2>&1 | grep -E "(AgencyEditor|AgencyCodePane|AgencyInlineAI|error TS)"
```

Expected: no errors.

**Step 11: Build and smoke test**

```bash
npm run build
```

Then open the Agency editor, click the `</>` button — should split the center column. Click a component in the tree — should load its source into the Astro editor and global.css into the CSS editor.

**Step 12: Commit**

```bash
git add ui/src/components/agency/AgencyEditor.tsx
git commit -m "feat(agency): Code Mode toggle — split Monaco editors + Inline AI"
```

---

### Task 8: Bump version + changelog + deploy

**Files:**
- Modify: `ui/src/lib/version.ts`
- Modify: `package.json`

**Step 1: Bump version in package.json**

Change `"version": "0.26.0"` to `"version": "0.27.0"`.

**Step 2: Update DEV_CHANGELOG in ui/src/lib/version.ts**

Add two entries at the top of the `DEV_CHANGELOG` array:

```typescript
{ date: '2026-02-19', summary: 'Agency Code Mode: dual Monaco editors + Inline AI + auto-save' },
{ date: '2026-02-19', summary: 'Agency Code Mode: file read/write endpoints + inline-ai streaming endpoint' },
```

Also update the `VERSION` constant to `'0.27.0'`.

**Step 3: Build and deploy**

```bash
npm run build && npx wrangler deploy
```

**Step 4: Commit and push**

```bash
git add package.json package-lock.json ui/src/lib/version.ts ui/src/lib/generated/build-info.ts
git commit -m "feat: Agency Code Mode v0.27.0"
git push origin main
```

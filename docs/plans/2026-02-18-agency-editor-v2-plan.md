# Agency Editor v2 — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix Agency Mode's two critical bugs (inspector granularity + iframe never reloads after edit) and upgrade AI edit quality with full file source context.

**Architecture:** Rewrite `vf-inspector.js` browser script to select specific child elements (not just component roots), send element HTML in postMessage. Force-reload iframe after each AI edit. Pass selected element HTML + full file source into AI prompt for surgical edits. Optionally inject Astro docs MCP for better syntax awareness.

**Tech Stack:** TypeScript (CF Worker), React 18, Tailwind v3.4, Zustand, Vitest

**Design doc:** `docs/plans/2026-02-18-agency-editor-v2-design.md`

---

## Phase 1: Fix Inspector Granularity + Iframe Reload

---

### Task 1: Rewrite `closest()` to return specific element

**Files:**
- Modify: `src/services/agency-inspector.ts:34-44` (the `closest` function in INSPECTOR_LINES)

**Context:** `closest()` currently walks up to `[data-vf-component]` and returns that root as the highlight target. We need it to return the *specific element* as the highlight but still extract component name + file from the ancestor.

**Step 1: Read the current `closest` function** (lines 34-44 of agency-inspector.ts) to confirm the exact string being replaced.

**Step 2: Replace the `closest` function in INSPECTOR_LINES**

Find this block:
```javascript
'function closest(el){',
'  var c=el;',
'  while(c&&c!==document.body){',
'    if(c.dataset&&c.dataset.vfComponent){',
'      return{component:c.dataset.vfComponent,',
'             file:c.dataset.vfFile||"",element:c};',
'    }',
'    c=c.parentElement;',
'  }',
'  return null;',
'}',
```

Replace with:
```javascript
'function closest(el){',
'  var c=el;',
'  while(c&&c!==document.body){',
'    if(c.dataset&&c.dataset.vfComponent){',
'      return{component:c.dataset.vfComponent,',
'             file:c.dataset.vfFile||"",',
'             element:el,',
'             componentRoot:c};',
'    }',
'    c=c.parentElement;',
'  }',
'  return null;',
'}',
```

**Key change:** `element: el` (the specific clicked/hovered element) instead of `element: c` (the component root). `componentRoot: c` keeps the component root accessible for label display.

**Step 3: Update the label to show specific element + parent**

Find the mousemove handler label line:
```javascript
'      label.textContent=comp.component;',
```
Replace with:
```javascript
'      var tag=comp.element.tagName.toLowerCase();',
'      var txt=comp.element.textContent?comp.element.textContent.trim().slice(0,20):"";',
'      label.textContent=tag+(txt?" \u201c"+txt+"\u201d":"")+" in "+comp.component;',
```

**Step 4: Rebuild inspector script** is automatic — `getInspectorScript()` joins the array. No separate build step.

**Step 5: Commit**
```bash
git add src/services/agency-inspector.ts
git commit -m "fix(agency): inspector closest() highlights specific element not component root"
```

---

### Task 2: Expand postMessage vf-select payload with element details

**Files:**
- Modify: `src/services/agency-inspector.ts` (click handler, lines ~118-126)

**Context:** The click handler sends `{ type: 'vf-select', component, file }`. We need to add `elementTag`, `elementHTML` (capped at 1000 chars), and `elementText`.

**Step 1: Find the click postMessage line**
In INSPECTOR_LINES, find:
```javascript
'      P.postMessage({type:"vf-select",',
'        component:comp.component,file:comp.file},"*");',
```

**Step 2: Replace with enriched payload**
```javascript
'      var eHTML=comp.element.outerHTML||"";',
'      if(eHTML.length>1000)eHTML=eHTML.slice(0,1000)+"...";',
'      var eTxt=(comp.element.textContent||"").trim().slice(0,100);',
'      var eTag=comp.element.tagName.toLowerCase();',
'      P.postMessage({type:"vf-select",',
'        component:comp.component,file:comp.file,',
'        elementTag:eTag,elementHTML:eHTML,elementText:eTxt},"*");',
```

**Step 3: Commit**
```bash
git add src/services/agency-inspector.ts
git commit -m "fix(agency): vf-select postMessage includes elementTag, elementHTML, elementText"
```

---

### Task 3: Add vf-reload message listener to inspector

**Files:**
- Modify: `src/services/agency-inspector.ts` (window message handler, lines ~155-160)

**Context:** After an AI edit completes, the Worker will instruct the iframe to reload. The inspector needs to listen for `{ type: 'vf-reload' }`.

**Step 1: Find the existing message handler**
In INSPECTOR_LINES:
```javascript
'  window.addEventListener("message",function(e){',
'    if(e.data&&e.data.type==="vf-deselect"){',
'      selected=null;selBox.style.display="none";',
'    }',
'  });',
```

**Step 2: Add vf-reload case**
```javascript
'  window.addEventListener("message",function(e){',
'    if(e.data&&e.data.type==="vf-deselect"){',
'      selected=null;selBox.style.display="none";',
'    }',
'    if(e.data&&e.data.type==="vf-reload"){',
'      location.reload();',
'    }',
'  });',
```

**Step 3: Commit**
```bash
git add src/services/agency-inspector.ts
git commit -m "fix(agency): inspector listens for vf-reload message to refresh preview"
```

---

### Task 4: Update TypeScript types for element-level selection

**Files:**
- Modify: `ui/src/components/agency/AgencyEditor.tsx:18-21` (ComponentInfo interface)
- Modify: `ui/src/components/agency/EditPanel.tsx:4-7` (SelectedComponent interface)

**Context:** Both interfaces only have `{ component: string, file: string }`. Need to add optional element fields.

**Step 1: Update ComponentInfo in AgencyEditor.tsx**
Find:
```typescript
interface ComponentInfo {
  component: string;
  file: string;
}
```
Replace with:
```typescript
interface ComponentInfo {
  component: string;
  file: string;
  elementTag?: string;
  elementHTML?: string;
  elementText?: string;
}
```

**Step 2: Update SelectedComponent in EditPanel.tsx**
Find:
```typescript
interface SelectedComponent {
  component: string;
  file: string;
}
```
Replace with:
```typescript
interface SelectedComponent {
  component: string;
  file: string;
  elementTag?: string;
  elementHTML?: string;
  elementText?: string;
}
```

**Step 3: Update vf-select message handler in AgencyEditor.tsx**
Find (around line 174):
```typescript
      if (data.type === 'vf-select') {
        setSelectedComponent({
          component: data.component,
          file: data.file,
        });
```
Replace with:
```typescript
      if (data.type === 'vf-select') {
        setSelectedComponent({
          component: data.component,
          file: data.file,
          elementTag: data.elementTag,
          elementHTML: data.elementHTML,
          elementText: data.elementText,
        });
```

**Step 4: Run typecheck**
```bash
npm run typecheck
```
Expected: 0 errors.

**Step 5: Commit**
```bash
git add ui/src/components/agency/AgencyEditor.tsx ui/src/components/agency/EditPanel.tsx
git commit -m "feat(agency): ComponentInfo type includes element-level fields"
```

---

### Task 5: Update EditPanel header to show element info

**Files:**
- Modify: `ui/src/components/agency/EditPanel.tsx:63-81` (header section)

**Context:** The header currently shows just the component name ("HeroCentered"). With element data available, it should show "button 'Book Consultation' in HeroCentered".

**Step 1: Find the header component name display**
In EditPanel.tsx around line 68:
```tsx
          <>
            <FileCode className="h-3.5 w-3.5 text-purple-400" />
            <div className="min-w-0 flex-1">
              <span className="block truncate text-[11px] font-medium text-purple-300">
                {selectedComponent.component}
              </span>
            </div>
          </>
```

**Step 2: Replace with element-aware display**
```tsx
          <>
            <FileCode className="h-3.5 w-3.5 text-purple-400" />
            <div className="min-w-0 flex-1 flex flex-col gap-0.5">
              {selectedComponent.elementTag && (
                <span className="block truncate text-[10px] font-mono text-cyan-400">
                  {`<${selectedComponent.elementTag}>`}
                  {selectedComponent.elementText && (
                    <span className="text-zinc-400"> &ldquo;{selectedComponent.elementText.slice(0, 24)}&rdquo;</span>
                  )}
                </span>
              )}
              <span className="block truncate text-[11px] font-medium text-purple-300">
                {selectedComponent.component}
              </span>
            </div>
          </>
```

**Step 3: Update placeholder text to reference element**
Find the placeholder:
```tsx
              placeholder={
                selectedComponent
                  ? `Edit ${selectedComponent.component}...`
                  : 'Describe a site-wide edit...'
              }
```
Replace with:
```tsx
              placeholder={
                selectedComponent
                  ? selectedComponent.elementTag
                    ? `Edit <${selectedComponent.elementTag}> in ${selectedComponent.component}...`
                    : `Edit ${selectedComponent.component}...`
                  : 'Describe a site-wide edit...'
              }
```

**Step 4: Run typecheck**
```bash
npm run typecheck
```
Expected: 0 errors.

**Step 5: Commit**
```bash
git add ui/src/components/agency/EditPanel.tsx
git commit -m "feat(agency): EditPanel shows element tag and text preview in selection header"
```

---

### Task 6: Pass elementHTML from EditPanel to handleSendEdit + force iframe reload

**Files:**
- Modify: `ui/src/components/agency/EditPanel.tsx:17-21, 49` (Props interface + onSendEdit call)
- Modify: `ui/src/components/agency/AgencyEditor.tsx:239-290` (handleSendEdit)

**Context:** `onSendEdit` currently sends `(instruction, componentFile)`. Need to also send `elementHTML`. After WS closes, force-reload the iframe.

**Step 1: Update Props interface in EditPanel.tsx**
Find:
```typescript
interface Props {
  selectedComponent: SelectedComponent | null;
  siteId: string | null;
  onSendEdit: (instruction: string, componentFile: string | null) => void;
  isStreaming: boolean;
}
```
Replace with:
```typescript
interface Props {
  selectedComponent: SelectedComponent | null;
  siteId: string | null;
  onSendEdit: (instruction: string, componentFile: string | null, elementHTML: string | null) => void;
  isStreaming: boolean;
}
```

**Step 2: Update onSendEdit call in EditPanel.tsx handleSubmit**
Find (around line 49):
```typescript
    onSendEdit(trimmed, selectedComponent?.file || null);
```
Replace with:
```typescript
    onSendEdit(trimmed, selectedComponent?.file || null, selectedComponent?.elementHTML || null);
```

**Step 3: Update handleSendEdit in AgencyEditor.tsx**
Find (around line 239):
```typescript
  const handleSendEdit = useCallback(
    async (instruction: string, componentFile: string | null) => {
```
Replace with:
```typescript
  const handleSendEdit = useCallback(
    async (instruction: string, componentFile: string | null, elementHTML: string | null) => {
```

Find (around line 246):
```typescript
        const params = new URLSearchParams({
          token: token || '',
          siteId: editingSiteId,
          instruction,
          siteWide: componentFile ? 'false' : 'true',
        });
        if (componentFile) params.set('componentFile', componentFile);
```
Replace with:
```typescript
        const params = new URLSearchParams({
          token: token || '',
          siteId: editingSiteId,
          instruction,
          siteWide: componentFile ? 'false' : 'true',
        });
        if (componentFile) params.set('componentFile', componentFile);
        if (elementHTML) params.set('elementHTML', elementHTML);
```

**Step 4: Add iframe reload after WS closes in AgencyEditor.tsx**
Find the WS promise block. After the commit call (look for the `auto-commit now that agent has finished` comment and the fetch call below it), add:
```typescript
        // Reload iframe to reflect file changes (HMR is disabled)
        if (iframeRef.current) {
          iframeRef.current.src = iframeRef.current.src;
        }
```

Look for the end of the WS promise block. The commit fetch happens after `ws.onclose` resolves. The reload should come right after the commit fetch.

**Step 5: Update AgencyEditor where EditPanel is rendered**
Search for `<EditPanel` and update the `onSendEdit` prop type — TypeScript will flag it if the arrow function signature doesn't match. The existing prop is likely `(instruction, file) => handleSendEdit(instruction, file)`. Update to:
```tsx
onSendEdit={(instruction, file, elemHTML) => handleSendEdit(instruction, file, elemHTML)}
```

**Step 6: Run typecheck**
```bash
npm run typecheck
```
Expected: 0 errors.

**Step 7: Commit**
```bash
git add ui/src/components/agency/AgencyEditor.tsx ui/src/components/agency/EditPanel.tsx
git commit -m "fix(agency): pass elementHTML to WS edit; force iframe reload after edit completes"
```

---

## Phase 2: Rich AI Context for Surgical Edits

---

### Task 7: Add GET /api/agency/sites/:id/source endpoint

**Files:**
- Modify: `src/api/agency.ts` (add new route after the diff route, before edit-ws)

**Context:** The Worker needs to read a file from the container to include in the AI prompt. This endpoint also lets the frontend preview what file is being edited.

**Step 1: Find where to insert the route**
Search for the `diff` route or the `edit-ws` route in agency.ts. The source route goes between them.

**Step 2: Add the route**
```typescript
// Read a source file from the agency container
agencyRoutes.get('/sites/:id/source', async (c) => {
  const siteId = c.req.param('id');
  const file = c.req.query('file') ?? '';

  // Sanitize: only allow .astro, .css, .ts files in /workspace; block path traversal
  if (!file || !/\.(astro|css|ts|js|mjs)$/.test(file) || file.includes('..')) {
    return c.json({ success: false, error: 'Invalid file path' }, 400);
  }

  const sm = c.get('sandboxManager');
  const sessionId = `agency-${siteId}`;
  const safePath = `/workspace/${file.replace(/^\//, '')}`;

  try {
    const result = await sm.execInSandbox(sessionId, `cat "${safePath}"`, { timeout: 5000 });
    const source = result.stdout ?? '';
    return c.json({ success: true, data: { source } });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return c.json({ success: false, error: `Could not read file: ${msg}` }, 500);
  }
});
```

**Step 3: Run typecheck**
```bash
npm run typecheck
```
Expected: 0 errors.

**Step 4: Commit**
```bash
git add src/api/agency.ts
git commit -m "feat(agency): GET /sites/:id/source returns file content from container"
```

---

### Task 8: Enrich AI prompt with file source and element context

**Files:**
- Modify: `src/api/agency.ts:399-472` (handleAgencyEditWs function)

**Context:** Currently the prompt is just `Edit file: X\nTask: Y`. Adding the selected element HTML and full file source turns vague instructions into precise ones.

**Step 1: Add elementHTML parameter extraction**
In `handleAgencyEditWs`, find:
```typescript
  const componentFile = url.searchParams.get('componentFile') || null;
  const siteWide = url.searchParams.get('siteWide') === 'true';
```
Add below:
```typescript
  const elementHTML = url.searchParams.get('elementHTML') || null;
```

**Step 2: Fetch file source from container before building prompt**
After the `if (!siteId || !instruction)` guard and after the `sessionId` assignment, add:

```typescript
  // Read current file source for AI context (non-fatal if fails)
  let fileSource = '';
  if (componentFile) {
    try {
      const safePath = `/workspace/${componentFile.replace(/^\//, '').replace(/\.\./g, '')}`;
      const readResult = await sandboxManager.execInSandbox(
        sessionId,
        `cat "${safePath}"`,
        { timeout: 5000 }
      );
      fileSource = readResult.stdout ?? '';
      // Cap at 6000 chars — enough for any component file, stays within prompt budget
      if (fileSource.length > 6000) {
        fileSource = fileSource.slice(0, 6000) + '\n... (truncated)';
      }
    } catch {
      // Non-fatal — AI can still work without source context
    }
  }
```

**Step 3: Update the non-siteWide fullPrompt branch**
Find the existing non-siteWide prompt:
```typescript
    : [
        `Edit the file: ${componentFile}`,
        '',
        `Task: ${instruction}`,
        '',
        'Rules:',
        `- Edit ONLY ${componentFile}`,
        '- Preserve data-vf-component and data-vf-file attributes on elements',
        '- Prefer CSS custom properties (var(--*)) for colors, spacing, typography',
        '- Do NOT add hardcoded hex colors, pixel values, or font names',
        '- Preserve the Astro frontmatter (--- block) structure',
        '- Keep the component functional and syntactically valid',
      ].join('\n');
```

Replace with:
```typescript
    : [
        `Edit the file: ${componentFile}`,
        '',
        ...(elementHTML ? [
          'Selected element (the element the user clicked):',
          elementHTML,
          '',
        ] : []),
        `Task: ${instruction}`,
        '',
        ...(fileSource ? [
          'Current file source:',
          '```astro',
          fileSource,
          '```',
          '',
        ] : []),
        'Rules:',
        `- Edit ONLY ${componentFile}`,
        ...(elementHTML ? ['- Make your change adjacent to or inside the selected element shown above'] : []),
        '- Preserve data-vf-component and data-vf-file attributes on all elements',
        '- Prefer CSS custom properties (var(--*)) for colors, spacing, typography',
        '- Do NOT add hardcoded hex colors, pixel values, or font names',
        '- Preserve the Astro frontmatter (--- block) structure',
        '- Keep the component functional and syntactically valid Astro',
      ].join('\n');
```

**Step 4: Run typecheck**
```bash
npm run typecheck
```
Expected: 0 errors.

**Step 5: Test the diff**
Start dev server and trigger an agency edit. Check wrangler logs to see the prompt being built. Confirm `fileSource` and `elementHTML` appear in the prompt.

**Step 6: Commit**
```bash
git add src/api/agency.ts
git commit -m "feat(agency): AI prompt includes selected element HTML and full file source"
```

---

## Phase 3: Astro Docs MCP Injection

---

### Task 9: Inject Astro docs MCP server into agency sessions

**Files:**
- Modify: `src/sandbox.ts` — `kickoffAgencySetup` function (around line 884, after setup steps)

**Context:** The Astro docs MCP server at `https://mcp.docs.astro.build/mcp` is HTTP-based. Injecting it into the claude-agent.js config means the AI can look up Astro syntax while making edits — reducing invalid Astro output.

**Step 1: Find where the agency WS context is written**
In `src/api/agency.ts`, `handleAgencyEditWs` calls `sandboxManager.writeContextFile(sessionId, {...})`. The `env` object is built here.

**Step 2: Add Astro MCP to the context file `mcpServers` field**
In `handleAgencyEditWs`, find the `writeContextFile` call:
```typescript
    await sandboxManager.writeContextFile(sessionId, {
      prompt: fullPrompt,
      sessionId: '',
      cwd: '/workspace',
      env: { ... },
    });
```

Add a `mcpServers` field:
```typescript
    await sandboxManager.writeContextFile(sessionId, {
      prompt: fullPrompt,
      sessionId: '',
      cwd: '/workspace',
      env: { ... },
      mcpServers: {
        'astro-docs': {
          type: 'http',
          url: 'https://mcp.docs.astro.build/mcp',
        },
      },
    });
```

**Step 3: Check if writeContextFile type supports mcpServers**
Search in `src/sandbox.ts` for the `writeContextFile` function signature. If `mcpServers` is not in the type, add it:
```typescript
// In the ContextFile or similar interface:
mcpServers?: Record<string, { type: string; url?: string; command?: string }>;
```

Also find where the context file is READ in the container (`ws-agent-server.js` / `claude-agent.js`). Search the Dockerfile heredocs in sandbox.ts for `mcpServers` handling. If claude-agent.js already handles `mcpServers` from the context file (it does — this is the same mechanism used for Gemini), this just works.

**Step 4: Run typecheck**
```bash
npm run typecheck
```
Expected: 0 errors.

**Step 5: Commit**
```bash
git add src/api/agency.ts src/sandbox.ts
git commit -m "feat(agency): inject Astro docs MCP server into agency edit sessions"
```

---

## Phase 4: Build + Deploy

---

### Task 10: Full build and deploy

**Step 1: Run full build**
```bash
npm run build
```
Expected: No errors. All 4 steps complete: build:info, build:landing, build:ui, build:merge.

**Step 2: If build fails, check for:**
- TypeScript errors → fix in the relevant file
- Long string errors → check if any new inline strings exceed 500 chars
- Import errors → check that new params are threaded through all call sites

**Step 3: Deploy**
```bash
npx wrangler deploy
```

**Step 4: Smoke test**
1. Open vaporforge.dev/app in browser
2. Create or open an existing agency site
3. Wait for dev server to start (loading screen)
4. Hover over the iframe — verify individual elements (buttons, headings) highlight, not just sections
5. Click a button — verify EditPanel shows `<button>` tag and text preview
6. Type "change the button text to Get Started" → send
7. Wait for stream — verify iframe reloads automatically after completion
8. Click "Book Consultation" button context → type "add another button 'Learn More' next to this" → send
9. Verify the second button appears after reload

**Step 5: Update version in ui/src/lib/version.ts**
- Bump version to `0.26.0`
- Add DEV_CHANGELOG entry: `2026-02-18: Agency Mode v2 — inspector selects child elements, iframe reloads after edits, AI gets file source context`

**Step 6: Final commit**
```bash
git add -A
git commit -m "feat: Agency Mode v2 — child element selection, auto-reload, surgical AI edits"
```

---

## Gotchas

- **outerHTML size**: The 1000-char cap in the inspector prevents oversized WS query params. URL query params have browser limits (~2000 chars total). Keep `elementHTML` capped.
- **File source fetch is pre-WS**: The `execInSandbox` call in `handleAgencyEditWs` happens BEFORE `startWsServer()`. Both ops hit the same container — order doesn't matter but both must succeed.
- **iframeRef.current.src reload trick**: This is the simplest way to force a full page reload in a cross-origin iframe without postMessage. It discards the inspector's selected state — intentional, user re-selects after seeing changes.
- **Astro MCP HTTP transport**: The `https://mcp.docs.astro.build/mcp` endpoint is public and free. No auth required. May have rate limits — this is best-effort and non-fatal.
- **String length in fullPrompt**: The enriched prompt can be large (6000 char source + 1000 char element). This is well within Claude's context window. The `string-length.md` rule applies to inline strings in code, not AI prompts.
- **`execInSandbox` cwd for source read**: Always use the full `/workspace/` path. The `cat` command doesn't depend on cwd.

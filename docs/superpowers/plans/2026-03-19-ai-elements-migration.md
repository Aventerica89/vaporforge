---
title: AI Elements Migration — Replace Custom Streaming Rendering
type: refactor
status: WORKING
scope: vaporforge
---

# AI Elements Migration — Replace Custom Streaming Rendering

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox syntax for tracking.

**Goal:** Eliminate the vertical reflow flash on stream completion by replacing the two-phase text renderer (SmoothText during stream, ChatMarkdown after) with a single MemoizedMarkdown component that renders identically in both states.

**Architecture:** The AI SDK cookbook MemoizedMarkdown pattern uses marked.lexer() to split markdown into blocks, then React.memo per block so only the actively-streaming block re-renders. Same component renders during AND after streaming — zero DOM transition, zero reflow. All cosmetic markdown overrides are stripped; only the CodeBlock ai-element (syntax highlighting) is preserved as a functional necessity.

**Tech Stack:** marked (lexer only), react-markdown, React.memo, existing ai-elements/code-block.tsx

---

## File Map

| Action | File | Purpose |
|--------|------|---------|
| Create | ui/src/components/chat/MemoizedMarkdown.tsx | 25-line block-splitting memoized markdown renderer |
| Modify | ui/src/components/chat/MessageContent.tsx | Replace two-phase text render with MemoizedMarkdown |
| Modify | ui/src/components/chat/MessageContent.tsx | Pass messageId into renderPart |
| Delete | ui/src/hooks/useSmoothText.ts | Remove rAF character-drip animation |
| Delete | ui/src/components/chat/StreamingMarkdown.tsx | Remove Streamdown-based streaming renderer |
| Modify | ui/src/components/chat/ChatMarkdown.tsx | Strip to minimal or delete if unused |
| Modify | ui/src/hooks/useSmoothStreaming.ts | Keep toggle alive but disconnect (no-op) |
| Verify | ui/src/components/ai-elements/message.tsx | MessageResponse (Streamdown) — no longer imported by main chat |
| Verify | ui/src/components/ai-elements/conversation.tsx | StickToBottom scroll — unchanged |

## Dependencies Check

marked — check if already installed:

    grep '"marked"' ui/package.json

If missing: cd ui and npm install marked

react-markdown — already used by ChatMarkdown.tsx (confirmed in imports).

---

## Task 1: Create MemoizedMarkdown Component

**Files:**
- Create: ui/src/components/chat/MemoizedMarkdown.tsx

- [ ] **Step 1: Create the MemoizedMarkdown component**

This is the AI SDK cookbook pattern with one addition: a minimal code component override that routes fenced code blocks to the existing CodeBlock ai-element (preserves syntax highlighting).

The component:
1. Uses marked.lexer() to split markdown into top-level blocks
2. Wraps each block in React.memo so completed blocks never re-render
3. Uses react-markdown with remarkGfm for GFM tables/strikethrough
4. Routes fenced code blocks to the existing CodeBlock ai-element
5. Keeps inline code and no-language pre blocks minimal
6. Wraps output in prose-chat div for base typography

Key imports: marked, memo, useMemo from react, ReactMarkdown, remarkGfm, CodeBlock and sub-components from ai-elements/code-block, BundledLanguage from shiki.

The parseMarkdownIntoBlocks function calls marked.lexer(markdown) and maps tokens to token.raw strings.

MemoizedMarkdownBlock is memo-wrapped, compares prev.content to next.content. It renders ReactMarkdown with remarkGfm plugin and a components override for code and pre elements only.

The code component: checks className for language-X pattern. If fenced code with language, renders CodeBlock with header, filename, copy button. If multiline without language, renders a plain pre block. If inline, renders a minimal code element.

The pre component returns children directly (passthrough — CodeBlock handles its own wrapper).

MemoizedMarkdown is the exported memo component. Takes content (string) and id (string). Uses useMemo to parse blocks. Maps blocks to MemoizedMarkdownBlock with key of id-block_index. Wraps in a div with className prose-chat text-sm leading-relaxed break-words.

- [ ] **Step 2: Verify it compiles**

    cd /Users/jb/repos/vaporforge && npm run build 2>&1 | head -30

If marked is not installed, run cd ui && npm install marked first.

- [ ] **Step 3: Commit**

    git add ui/src/components/chat/MemoizedMarkdown.tsx
    git commit -m "feat: add MemoizedMarkdown component (AI SDK cookbook pattern)"

---

## Task 2: Wire MemoizedMarkdown into MessageContent

**Files:**
- Modify: ui/src/components/chat/MessageContent.tsx

The key change: replace the two-phase case text in renderPart() with a single MemoizedMarkdown call. This requires threading messageId into renderPart.

- [ ] **Step 1: Add messageId parameter to renderPart**

Current signature at line ~230:

    function renderPart(part, index, isStreaming, allParts)

Add messageId as the 5th parameter with type string and optional.

- [ ] **Step 2: Replace the case text block**

Current code at lines ~237-243 has the two-phase render: isStreaming uses SmoothText, else uses ChatMarkdown.

Replace with a single MemoizedMarkdown call using key text-index, id of messageId or fallback msg-index, content of part.content. Keep the early return null if no content.

- [ ] **Step 3: Update all renderPart call sites to pass messageId**

Search for renderPart( in MessageContent.tsx. Each call site needs messageId added as the last argument. The messageId comes from the parent message.id.

In StreamingContent component (renders streaming parts): add message.id as last arg.
In MessageContent component (renders completed parts): add message.id as last arg.
In ToolGroup (renders grouped tool calls): thread messageId as a prop, pass it through.

- [ ] **Step 4: Update imports**

Add: import MemoizedMarkdown from ./MemoizedMarkdown
Remove: import ChatMarkdown from ./ChatMarkdown
Remove: import useSmoothText from hooks/useSmoothText

Also remove the SmoothText internal component if it exists in this file.

- [ ] **Step 5: Remove the SmoothText component**

Search MessageContent.tsx for a SmoothText component definition. It likely wraps useSmoothText. Delete the entire component.

- [ ] **Step 6: Remove useSmoothStreaming import if no longer consumed**

If useSmoothStreaming is imported only for SmoothText, remove it.

- [ ] **Step 7: Verify build**

    cd /Users/jb/repos/vaporforge && npm run build 2>&1 | head -30

- [ ] **Step 8: Commit**

    git add ui/src/components/chat/MessageContent.tsx
    git commit -m "refactor: replace two-phase text render with MemoizedMarkdown"

---

## Task 3: Delete Dead Code

**Files:**
- Delete: ui/src/hooks/useSmoothText.ts
- Delete: ui/src/components/chat/StreamingMarkdown.tsx

- [ ] **Step 1: Check for remaining imports of useSmoothText**

    grep -r "useSmoothText" ui/src/ --include="*.tsx" --include="*.ts" -l

Expected: only useSmoothText.ts itself. If QuickChat or other files import it, note them for Task 5.

- [ ] **Step 2: Check for remaining imports of StreamingMarkdown**

    grep -r "StreamingMarkdown" ui/src/ --include="*.tsx" --include="*.ts" -l

Expected: only StreamingMarkdown.tsx itself. If imported elsewhere, update those files first.

- [ ] **Step 3: Delete the files**

    rm ui/src/hooks/useSmoothText.ts
    rm ui/src/components/chat/StreamingMarkdown.tsx

- [ ] **Step 4: Verify build**

    cd /Users/jb/repos/vaporforge && npm run build 2>&1 | head -30

- [ ] **Step 5: Commit**

    git add -u
    git commit -m "refactor: delete useSmoothText and StreamingMarkdown (replaced by MemoizedMarkdown)"

---

## Task 4: Disconnect useSmoothStreaming Toggle

**Files:**
- Check: ui/src/hooks/useSmoothStreaming.ts (if exists)

The smooth streaming toggle in DevTools should remain visible but become a no-op.

- [ ] **Step 1: Find the toggle**

    grep -r "useSmoothStreaming\|smoothStreaming\|smooth_streaming" ui/src/ --include="*.tsx" --include="*.ts" -l

- [ ] **Step 2: Verify it is disconnected**

After Task 2, the toggle has no consumers in the text render path. Confirm no remaining code reads it for rendering decisions. If the hook itself has no side effects beyond returning a value, it is harmless. The toggle in DevTools stays for future use.

- [ ] **Step 3: Commit (if changes needed)**

    git add -u
    git commit -m "refactor: disconnect smooth streaming toggle (preserved for future use)"

---

## Task 5: Check QuickChat Text Rendering

**Files:**
- Check: ui/src/components/QuickChatPanel.tsx (or wherever QuickChat renders text)

QuickChat may also use useSmoothText or StreamingMarkdown. If so, update it to use MemoizedMarkdown too.

- [ ] **Step 1: Search for useSmoothText in QuickChat**

    grep -rn "useSmoothText\|SmoothText\|StreamingMarkdown\|MessageResponse" ui/src/components/QuickChat* ui/src/components/quickchat* --include="*.tsx"

- [ ] **Step 2: If found, replace with MemoizedMarkdown**

Same pattern: import MemoizedMarkdown, replace the streaming text render. Use a stable id like quickchat-messageIndex.

- [ ] **Step 3: Verify build**

    cd /Users/jb/repos/vaporforge && npm run build 2>&1 | head -30

- [ ] **Step 4: Commit (if changes needed)**

    git add -u
    git commit -m "refactor: update QuickChat to use MemoizedMarkdown"

---

## Task 6: Clean Up ChatMarkdown

**Files:**
- Possibly delete: ui/src/components/chat/ChatMarkdown.tsx

- [ ] **Step 1: Check remaining imports**

    grep -r "ChatMarkdown" ui/src/ --include="*.tsx" --include="*.ts" -l

- [ ] **Step 2: If no remaining imports, delete it**

    rm ui/src/components/chat/ChatMarkdown.tsx

- [ ] **Step 3: If still imported somewhere, leave it** (not hurting anything, clean up later)

- [ ] **Step 4: Also check if MessageResponse from message.tsx is still imported anywhere in main chat**

    grep -rn "MessageResponse" ui/src/ --include="*.tsx" -l

If only imported by StreamingMarkdown.tsx (now deleted) and message.tsx itself, no action needed.

- [ ] **Step 5: Verify build**

    cd /Users/jb/repos/vaporforge && npm run build 2>&1 | head -30

- [ ] **Step 6: Commit**

    git add -u
    git commit -m "refactor: clean up unused ChatMarkdown and MessageResponse imports"

---

## Task 7: Full Build + Deploy + Test

- [ ] **Step 1: Full build**

    cd /Users/jb/repos/vaporforge && npm run build

Must succeed with zero errors.

- [ ] **Step 2: Deploy**

    cd /Users/jb/repos/vaporforge && npx wrangler deploy

- [ ] **Step 3: Manual test checklist**

Open https://vaporforge.dev/app/ and test:

1. Send a message — text should render progressively as markdown (headings, bold, lists, code blocks)
2. Stream completion — NO visible reflow/jump when streaming ends
3. Code blocks — should have syntax highlighting and copy button
4. Scroll behavior — should stick to bottom during stream, no jarring jumps
5. Historical messages — reload page, previous messages should render correctly
6. QuickChat — if updated, test quick chat text rendering too

- [ ] **Step 4: Commit and push**

    git push origin main

---

## What Was Removed

| Component | Lines | Why |
|-----------|-------|-----|
| useSmoothText.ts | 109 | rAF character-drip animation — caused two-phase render |
| StreamingMarkdown.tsx | 69 | Streamdown wrapper — no longer needed |
| ChatMarkdown.tsx custom components | ~100 | Cosmetic overrides — stripped for clean slate |
| Two-phase case text in renderPart | 7 | The root cause of the reflow flash |

## What Was Added

| Component | Lines | Why |
|-----------|-------|-----|
| MemoizedMarkdown.tsx | ~80 | AI SDK cookbook pattern + CodeBlock override |

## What Was Preserved

- All non-text ai-elements: Reasoning, Tool, CodeBlock, ChainOfThought, PlanCard, QuestionFlow, Confirmation, Checkpoint, Commit, TestResults
- conversation.tsx (StickToBottom scroll container)
- useSmoothStreaming toggle (disconnected, ready for future use)
- CodeBlock syntax highlighting (functional, routed through MemoizedMarkdown)

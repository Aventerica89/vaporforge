# VaporForge Frontend Codemap

**Last Updated:** 2026-03-14 (rev 3)

## Entry Points

- `ui/src/main.tsx` — React 18 app bootstrap
- `ui/src/App.tsx` — Root component, auth guard, layout selector
- `ui/src/components/Layout.tsx` — Desktop layout (3-panel: sidebar, chat, editor)
- `ui/src/components/MobileLayout.tsx` — Mobile layout (viewport-driven)

## Layout Components

| Component | Purpose |
|-----------|---------|
| **Layout.tsx** | Desktop 3-panel: SessionTabBar (left), ChatPanel (center-top), Editor (center-bottom) |
| **MobileLayout.tsx** | Single viewport, tab-based navigation, bottom sheet overlay |
| **SessionTabBar.tsx** | Horizontal session tabs, create/delete, drag-reorder, session browser |
| **Header.tsx** | Top navbar with settings, user menu, mode selector |
| **Editor.tsx** | Monaco editor, file tree, terminal, AI panels overlay |

## Main Chat Components

| Component | Purpose | State |
|-----------|---------|-------|
| **ChatPanel.tsx** | Chat message list + prompt input, streaming, scroll anchoring | `useSandbox` |
| **chat/MessageContent.tsx** | NDJSON frame renderer: text, reasoning, tool calls, artifacts | — |
| **chat/message.tsx** | Individual message wrapper with avatar, timestamp, actions | — |
| **PromptInput** | Form element for prompt input (owned styling by parent) | `useSandbox` |
| **chat/loader.tsx** | Streaming loader animation | — |

### Message Parts (MessageContent.tsx)

Renders structured NDJSON frames:
- `text-delta` → Text with smooth typewriter
- `reasoning-delta` → Collapsible reasoning block
- `tool-start/tool-result` → Tool call UI with input/output
- `artifact` → Code blocks with copy, syntax highlight
- `chain-of-thought` → Steps visualization
- `commit` → Git commit card
- `test-results` → Test suite results table
- `confirmation` → User confirmation dialog

## Quick Chat & AI Panels

| Component | Purpose | Transport |
|-----------|---------|-----------|
| **QuickChatPanel.tsx** | Sidebar quick AI chat (Cmd+Shift+Q), history, provider select; uses `StreamingTextPart` wrapper for smooth rendering | SSE/HTTP |
| **CodeTransformPanel.tsx** | Code transform with side-by-side diff (Cmd+Shift+T) | SSE/HTTP |
| **CodeAnalysisPanel.tsx** | Structured code analysis overlay (Cmd+Shift+A) | SSE/HTTP |
| **CommitMessageCard.tsx** | Smart commit message generation | SSE/HTTP |

## Settings & Integration Tabs

| Tab | Component | Purpose |
|-----|-----------|---------|
| Account | `AccountTab.tsx` | User profile, billing, tier |
| Appearance | `AppearanceTab.tsx` | Theme, font size, layout prefs |
| Keyboard | `KeyboardShortcutsTab.tsx` | Key bindings, customize |
| Rules | `RulesTab.tsx` | Edit CLAUDE.md in browser |
| Secrets | `SecretsTab.tsx` | Per-session environment variables |
| Plugins | `IntegrationsTab` | Install/manage plugins from marketplace |
| MCP Servers | `IntegrationsTab` | Add, configure, test MCP servers |
| AI Providers | `IntegrationsTab` | Add API keys for Claude, Gemini, OpenAI |
| Command Center | `CommandCenterTab.tsx` | Custom slash commands + rules |
| Agents | `AgentsTab.tsx` | View available agents |
| Dev Tools | `DevToolsTab.tsx` | Stream debug, latency meter, token viewer |
| About | `AboutTab.tsx` | Version, changelog, debug info |

## Agency Mode (Visual Editor)

| Component | Purpose |
|-----------|---------|
| **AgencyEditor.tsx** | Main layout: iframe preview + component tree + edit panel |
| **ComponentTree.tsx** | Discovered components sidebar with hierarchy |
| **AgencyCodePane.tsx** | File browser and source code editor |
| **AgencyLoadingScreen.tsx** | Setup progress: clone, install, dev server |
| **AgencyInlineAI.tsx** | Inline edit instructions input |
| **AgencyDebugPanel.tsx** | Debug output for inspection/tagging |

## File & Terminal Components

| Component | Purpose |
|-----------|---------|
| **FileTree.tsx** | Recursive file browser, right-click menu, drag, search |
| **Terminal.tsx** | xterm.js terminal emulator |
| **XTerminal.tsx** | React wrapper around xterm.js |
| **DiffViewer.tsx** | Split-pane diff view with syntax highlight |

## State Management (Zustand Hooks)

| Hook | Store | Purpose |
|------|-------|---------|
| **useSandbox** | Session + streaming state | Main chat state, message list, session ID, mode/model selection, `streamingLinger` flag |
| **useAuth** | User + JWT token | Login state, user profile, token refresh |
| **useQuickChat** | Quick chat history | Per-chat message list, active chat ID |
| **useLayoutStore** | Panel visibility | Show/hide panels, responsive breakpoints |
| **useIntegrationsStore** | Plugins + MCP | Installed plugins, MCP servers, AI providers |
| **useAgencyStore** | Agency mode | Current site URL, components, edit state |
| **useSettings** | User preferences | Theme, font size, keyboard shortcuts |
| **useCommandRegistry** | Slash commands | Available commands, custom commands |
| **useMarketplace** | Plugin catalog | Available plugins, search, install state |
| **useIssueTracker** | Issue list | Inline task tracking state |
| **useFavorites** | Bookmarks | Starred files/sessions |

## Streaming & WebSocket Hooks

| Hook | Purpose |
|-------|---------|
| **useWebSocket** | WS connection to container (port 8765, legacy path) |
| **useSmoothText** | Typewriter buffer for smooth text streaming; `isMidAnimation` guard: 3x catch-up only when cursor>0 + stream ended; 1.5x when cursor=0 (post-tool-use batch) |
| **useStreamDebug** | Stream event logging for DevTools |
| **useCodeTransform** | SSE streaming for code transform |
| **useQuickChat** | SSE streaming for quick chat |
| **useCodeAnalysis** | SSE streaming for analysis |
| **useCommitMessage** | SSE streaming for commit msg |
| **useVfChatWs** | V1.5 HTTP streaming consumer (browser-side parser for NDJSON) |

## Utility Hooks

| Hook | Purpose |
|-------|---------|
| **useFileWatcher** | SSE file change listener |
| **useGithubRepos** | GitHub API integration |
| **usePlayground** | Code playground eval |
| **useDiagnostics** | Client-side error tracking |
| **useDeviceInfo** | Device capabilities (touch, keyboard) |
| **useKeyboard** | Keyboard state + shortcuts |
| **useIsTouchDevice** | Touch device detection |
| **useMcpRelay** | MCP relay WebSocket manager |
| **useAutoReconnect** | Auto-reconnect logic for WS |

## Streaming Message Rendering

| Component | Purpose |
|-----------|---------|
| **StreamingMessage** (in MessageList.tsx) | Renders assistant response during streaming. Checks `hasContent = !!(streamingContent \|\| streamingParts.length > 0)` to show message while streaming OR lingering (linger = 300ms delay before clearing streamingParts) |
| **StreamingTextPart** (inline in QuickChatPanel.tsx) | Wraps `useSmoothText` for assistant text parts in quick chat; maintains streaming mode while animation is still catching up to prevent jump to static render |

## AI Elements (Rendering)

| Component | Purpose |
|-----------|---------|
| **ai-elements/Reasoning.tsx** | Collapsible reasoning block |
| **ai-elements/Tool.tsx** | Tool call card with input/output |
| **ai-elements/CodeBlock.tsx** | Syntax-highlighted code with copy |
| **ai-elements/Plan.tsx** | Task plan visualization |
| **ai-elements/Suggestion.tsx** | Action suggestion pill |
| **ai-elements/CitationCard.tsx** | Source attribution |
| **ai-elements/Confirmation.tsx** | User confirmation prompt |
| **ai-elements/ChainOfThought.tsx** | Steps visualization |
| **ai-elements/QuestionFlow.tsx** | Multi-step question UI |

## API Client

**File:** `ui/src/lib/api.ts`

- `request<T>(endpoint, options)` — JWT-authenticated HTTP wrapper
- `checkVersionHeader()` — Detect server updates
- Session CRUD, chat operations, plugin install, etc.
- Returns `ApiResponse<T>` with success flag

## Type System

**File:** `ui/src/lib/types.ts`

- `Session` — Session metadata (ID, status, sandbox)
- `Message` — Chat message with role, content, metadata
- `MessagePart` — NDJSON frame types (text, tool, artifact, etc.)
- `User` — Auth user profile
- `McpServerConfig` — MCP server configuration
- `Plugin` — Plugin manifest (metadata, source)
- `AIProviderConfig` — API key + model selection
- `ConfigFile` — CLAUDE.md, rules, commands

## Component Tree Hierarchy

```
App
├─ AuthGuard
│  └─ Layout (desktop) or MobileLayout (mobile)
│     ├─ Header (navbar + settings)
│     ├─ SessionTabBar (session tabs)
│     ├─ ChatPanel (main chat)
│     │  ├─ MessageList (messages)
│     │  │  └─ ChatMessage (renders MessagePart)
│     │  │     ├─ Reasoning (collapsible)
│     │  │     ├─ Tool (input/output)
│     │  │     ├─ CodeBlock (artifact)
│     │  │     └─ ChainOfThought (steps)
│     │  └─ PromptInput (form)
│     │
│     ├─ Editor (right panel)
│     │  ├─ FileTree (file browser)
│     │  ├─ Terminal (xterm)
│     │  ├─ QuickChatPanel (slide-out)
│     │  ├─ CodeTransformPanel (overlay)
│     │  └─ CodeAnalysisPanel (overlay)
│     │
│     ├─ SettingsPage (modal)
│     │  ├─ Tabs (Account, Appearance, Rules, etc.)
│     │  └─ Settings components
│     │
│     └─ IssueTracker (side panel)
│
├─ McpRelayProvider (WS context)
└─ MobileBottomSheet (mobile navigation)
```

## Navigation (Hash Router)

**File:** `ui/src/lib/hash-nav.ts`

Hash-based routing without query params (React #130 workaround):
- `#` or `#home` → home (session selection screen)
- `#session/{sessionId}` → open session
- `#settings` or `#settings/{tab}` → settings page
- `#agency` → agency mode dashboard
- `#settings/integrations?oauth_success=...` → OAuth callback with status

Hash parsing strips `?params` from tab name using `.split('?')[0]` to prevent React router hash collision. Layout applies state on mount and hashchange via `applyHashState()`.

## Styling

- **Tailwind CSS v3.4** — all component styling
- **shadcn/ui** — base component library
- **CSS Variables** — theme colors (light/dark)
- **No base styles on PromptInput** — styling owned by parent

## Mobile-Specific (iOS)

- Root: `html, body { height: 100dvh; overflow: hidden }`
- No `position: fixed` on html/body (blocks keyboard)
- Flexbox layout with `h-full`, `flex-1 overflow-y-auto`
- `scrollIntoView({ behavior: 'smooth' })` for scroll anchoring
- Tab bar hides on keyboard via `useKeyboard()` hook

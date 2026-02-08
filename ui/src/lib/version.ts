// Single source of truth for app version and changelog
// Update this file when releasing new versions

export const APP_VERSION = '0.7.0';

export interface ChangelogEntry {
  readonly version: string;
  readonly date: string;
  readonly tag: 'feature' | 'fix' | 'security' | 'breaking';
  readonly title: string;
  readonly items: readonly string[];
}

export const CHANGELOG: readonly ChangelogEntry[] = [
  {
    version: '0.7.0',
    date: '2026-02-08',
    tag: 'feature',
    title: 'Secrets Management',
    items: [
      'CRUD UI for managing environment secrets (Settings > Secrets tab)',
      'Secrets stored per-user in KV, injected as env vars into every session',
      'API never returns full values — only name + last-4-char hint',
      'Reserved names blocked (CLAUDE_CODE_OAUTH_TOKEN, PATH, etc.)',
      'Max 50 secrets per user, 10KB per value',
    ],
  },
  {
    version: '0.6.0',
    date: '2026-02-08',
    tag: 'feature',
    title: 'Landing Page, Pricing, and Login',
    items: [
      'Marketing landing page with hero, features, and how-it-works sections',
      'Pricing page with Pro tier at $20/month and FAQ',
      'Presentational login page linking to setup-token auth flow',
      'SPA moved to /app subdirectory with Vite base path',
      'Monorepo build: Astro landing + Vite SPA merged into single dist/',
    ],
  },
  {
    version: '0.5.0',
    date: '2026-02-08',
    tag: 'feature',
    title: 'Mobile Powerhouse — iPad, Theme, Haptics, Settings',
    items: [
      'Touch-friendly copy buttons: always visible on touch devices (no hover needed)',
      'iPad layout: tablet tier with 2-panel default, auto-collapsed file tree',
      'Cmd+Enter to send messages (iPad keyboard users)',
      'Dark/light theme toggle with full CSS variable system',
      'Haptic feedback on send, copy, and swipe gestures (Vibration API)',
      'Pull-to-refresh in mobile chat view',
      'Pinch-to-zoom in editor (10-24px) and terminal (9-22px) with persistence',
      'Commands tab: manage slash commands in sandbox ~/.claude/commands/',
      'MCP tab: manage MCP servers in sandbox ~/.claude.json',
      'PWA raster icons (192px, 512px) and screenshot entries in manifest',
      'Keyboard shortcuts guide expanded in settings',
    ],
  },
  {
    version: '0.4.6',
    date: '2026-02-07',
    tag: 'feature',
    title: 'Debug Panel + Image Pasting',
    items: [
      'Debug panel: floating Dev button captures API errors, stream failures, and uncaught exceptions',
      'Debug log: expandable entries with category badges, timestamps, and detail JSON',
      'Image pasting: Cmd+V images into chat, auto-uploads to sandbox for Claude to analyze',
      'Image preview strip with thumbnails and remove buttons below prompt input',
      'User messages show image attachment badges inline',
      'Backend upload-base64 route for binary file uploads to sandbox',
      'Enable debug panel: localStorage.setItem("vf_debug", "1")',
    ],
  },
  {
    version: '0.4.5',
    date: '2026-02-07',
    tag: 'feature',
    title: 'Session Persistence + File Explorer Expand/Collapse',
    items: [
      'Session survives page refresh: auto-restores last active session with chat, files, and git status',
      'Expand all / collapse all buttons in file explorer toolbar',
      'Expand all skips node_modules, .git, .next, dist, .cache',
      'Improved download icon visibility on selected file rows',
    ],
  },
  {
    version: '0.4.4',
    date: '2026-02-07',
    tag: 'feature',
    title: 'File Upload + Download/Export',
    items: [
      'Upload files: drag-and-drop or file picker, uploads to current directory',
      'Download individual files from file explorer (hover to reveal button)',
      'Download workspace as .tar.gz archive (excludes node_modules and .git)',
      'Upload spinner and drag overlay with visual feedback',
    ],
  },
  {
    version: '0.4.3',
    date: '2026-02-07',
    tag: 'feature',
    title: 'Session Management + Auto-Reconnect',
    items: [
      'Session naming: rename sessions inline from welcome screen or header',
      'Auto-reconnect: detects wake-from-sleep, resets stuck streams, wakes sandbox',
      'Session list: time-ago timestamps, status dots, show-all toggle',
      'Session name persisted to KV on create (was lost before)',
      'Cleaned up git repo URL display (strips https://github.com/ prefix)',
    ],
  },
  {
    version: '0.4.2',
    date: '2026-02-07',
    tag: 'fix',
    title: 'Clone Repo + File Explorer Navigation',
    items: [
      'Fixed clone repo: removed double-clone that caused /workspace conflict',
      'Branch parameter now passed through session creation',
      'File explorer: breadcrumb navigation with home button',
      'File explorer: ".." parent directory entry for going back',
      'File tree renders nested directories recursively with cached children',
      'Code review fixes: clipboard error handling, download timing, streaming flags',
    ],
  },
  {
    version: '0.4.1',
    date: '2026-02-07',
    tag: 'feature',
    title: 'Artifact + Chain of Thought Components',
    items: [
      'Artifact blocks: code files render with copy, download, and run actions',
      'Chain of thought: multi-step reasoning timeline with status indicators',
      'Auto-detect Write/Edit tool results and promote to artifact display',
      'Collapsible step content with search result badges',
    ],
  },
  {
    version: '0.4.0',
    date: '2026-02-07',
    tag: 'feature',
    title: 'UI Upgrade — AI Elements-Inspired Chat',
    items: [
      'Redesigned chat: edge-aligned messages (no avatar bubbles), cleaner spacing',
      'Enhanced tool call blocks with animated expand/collapse and live duration timer',
      'Code blocks with line numbers, filename headers, and line count display',
      'Collapsible reasoning/thinking blocks with shimmer animation',
      'Upgraded prompt input with pill-style border, ArrowUp send, inline stop button',
      'New shimmer skeleton streaming indicator with pulse animation',
      'File change blocks for create/edit/delete operations',
      'Reasoning part type support in streaming pipeline',
    ],
  },
  {
    version: '0.3.0',
    date: '2026-02-07',
    tag: 'feature',
    title: 'SDK Fix + Clone Repo + IDE Polish',
    items: [
      'Fixed SDK crash: added IS_SANDBOX, env spread, and continue flag',
      'System prompt enforces /workspace for file creation (no more /tmp)',
      'Clone Repo modal: import any Git repo into a new workspace',
      'Collapsible panels with Cmd+1/2/3 keyboard shortcuts',
      'Warp-inspired resize handles with grip dots and glow effects',
      'Panel headers with collapse/expand buttons and shortcut hints',
    ],
  },
  {
    version: '0.2.0',
    date: '2026-02-07',
    tag: 'feature',
    title: 'Tool Execution + Rich Chat',
    items: [
      'Claude can now create files, run commands, and edit code in the sandbox',
      'Rich chat UI with markdown rendering, syntax highlighting, and tool display',
      'Streaming SDK responses with structured tool-start/tool-result events',
      'Increased chat timeout from 60s to 5 min for complex tool operations',
    ],
  },
  {
    version: '0.1.2',
    date: '2026-02-06',
    tag: 'feature',
    title: 'Terminal Streaming + Session Continuity',
    items: [
      'Stream Claude CLI responses in the terminal via SSE',
      'Auto-prompt wrapping: plain text becomes `claude -p "..."`',
      'Session continuity with SDK resume parameter',
      'Hybrid SDK terminal with session management UI',
    ],
  },
  {
    version: '0.1.1',
    date: '2026-02-05',
    tag: 'fix',
    title: 'Auth + Sandbox Stability',
    items: [
      'Setup-token auth flow (replaced broken OAuth)',
      'Claude token injected as persistent sandbox env var',
      'Sandbox termination and timeout fixes',
      'Mobile-optimized layout with PWA support',
    ],
  },
  {
    version: '0.1.0',
    date: '2026-02-04',
    tag: 'feature',
    title: 'Initial Release',
    items: [
      'Web-based Claude Code IDE on Cloudflare Sandboxes',
      'File explorer, Monaco editor, xterm.js terminal',
      'Resizable panels (desktop) and tab navigation (mobile)',
      'R2 bucket for file persistence',
    ],
  },
];

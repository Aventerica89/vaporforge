// Single source of truth for app version and changelog
// Update this file when releasing new versions

export const APP_VERSION = '0.3.0';

export interface ChangelogEntry {
  readonly version: string;
  readonly date: string;
  readonly tag: 'feature' | 'fix' | 'security' | 'breaking';
  readonly title: string;
  readonly items: readonly string[];
}

export const CHANGELOG: readonly ChangelogEntry[] = [
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

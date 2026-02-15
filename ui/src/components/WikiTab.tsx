import {
  MessageSquare,
  Zap,
  Terminal,
  Code,
  Search,
  FileEdit,
  GitCommit,
  ChevronDown,
} from 'lucide-react';
import { useState } from 'react';

interface WikiSection {
  id: string;
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  capabilities: string[];
  shortcuts?: string;
  note?: string;
}

const WIKI_SECTIONS: WikiSection[] = [
  {
    id: 'main-chat',
    icon: <MessageSquare className="h-4 w-4" />,
    title: 'Main Chat',
    subtitle: 'Full Claude SDK in your sandbox',
    capabilities: [
      'Runs Claude Code SDK inside your sandbox container',
      'Full tool use: create files, edit code, run commands',
      'Access to your CLAUDE.md, plugins, agents, and MCP servers',
      'Session continuity — resume conversations across reloads',
      'Streaming responses with reasoning, tool calls, and artifacts',
      'Uses your Anthropic OAuth token (no API key needed)',
    ],
    note: 'This is the primary workspace — everything Claude Code can do locally, Main Chat can do in the cloud.',
  },
  {
    id: 'quick-chat',
    icon: <Zap className="h-4 w-4" />,
    title: 'Quick Chat',
    subtitle: 'Lightweight AI chat + agent mode',
    capabilities: [
      'Instant AI chat without starting a sandbox session',
      'Multi-provider: switch between Claude and Gemini models',
      'Agent mode: when a sandbox is active, gains 4 tools:',
      '  readFile — read any file in the sandbox',
      '  listFiles — browse directories',
      '  searchCode — grep across the codebase',
      '  runCommand — execute shell commands (requires approval)',
      'Up to 10 tool calls per message for multi-step tasks',
      'Chat history persisted in KV (7-day TTL)',
    ],
    shortcuts: 'Cmd+Shift+Q',
    note: 'Uses direct API keys (not OAuth). Configure in Settings > AI Providers.',
  },
  {
    id: 'terminal',
    icon: <Terminal className="h-4 w-4" />,
    title: 'Terminal',
    subtitle: 'xterm.js shell in the sandbox',
    capabilities: [
      'Real terminal emulator running in your sandbox container',
      'Execute any shell command (git, npm, python, etc.)',
      'Command output piped through test results + stack trace parsers',
      'Auto-detects Jest/Vitest/pytest/Mocha output with progress bar',
      'Clickable stack trace frames — opens file in editor',
      'Pinch-to-zoom font size (9-22px, persisted)',
    ],
    shortcuts: 'Cmd+2 (toggle panel)',
  },
  {
    id: 'code-transform',
    icon: <FileEdit className="h-4 w-4" />,
    title: 'Code Transform',
    subtitle: 'Describe a change, get a diff',
    capabilities: [
      'Select code in the editor, describe what you want changed',
      'AI generates the transform with a side-by-side diff view',
      'Toggle between Claude and Gemini providers',
      'Lazy-loaded Monaco DiffEditor for rich diff display',
      'Access from editor context menu or keyboard shortcut',
    ],
    shortcuts: 'Cmd+Shift+T',
    note: 'Uses direct API keys. Best for targeted, single-file transformations.',
  },
  {
    id: 'code-analysis',
    icon: <Search className="h-4 w-4" />,
    title: 'Code Analysis',
    subtitle: 'Structured analysis with complexity meter',
    capabilities: [
      'Analyzes code with streamObject() for progressive streaming',
      'Complexity meter (1-10) with color-coded gauge',
      'Severity-badged issues (critical, warning, info)',
      'Prioritized suggestions for improvement',
      'Access from editor context menu or keyboard shortcut',
    ],
    shortcuts: 'Cmd+Shift+A',
  },
  {
    id: 'commit-message',
    icon: <GitCommit className="h-4 w-4" />,
    title: 'Smart Commit Message',
    subtitle: 'AI-generated conventional commits',
    capabilities: [
      'Analyzes staged changes via generateObject()',
      'Generates type/scope/subject/body in conventional commit format',
      'Editable card with breaking change toggle',
      'Live preview of the final commit message',
    ],
    shortcuts: 'Cmd+Shift+G',
  },
  {
    id: 'editor',
    icon: <Code className="h-4 w-4" />,
    title: 'Editor',
    subtitle: 'Monaco editor with context menus',
    capabilities: [
      'Full Monaco editor with syntax highlighting for 50+ languages',
      'Context menu: Code Transform and Code Analysis on selected text',
      'CLAUDE.md auto-detected and editable with Cmd+S save',
      'Files opened from the file tree appear here',
      'Pinch-to-zoom font size (10-24px, persisted)',
    ],
    shortcuts: 'Cmd+2 (toggle panel)',
  },
];

function CollapsibleSection({ section }: { section: WikiSection }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="rounded-lg border border-border overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left transition-colors hover:bg-muted/50"
      >
        <span className="text-primary">{section.icon}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-foreground">
              {section.title}
            </span>
            {section.shortcuts && (
              <kbd className="inline-flex h-5 items-center rounded border border-border bg-muted px-1.5 font-mono text-[9px] text-muted-foreground">
                {section.shortcuts}
              </kbd>
            )}
          </div>
          <span className="text-[11px] text-muted-foreground">
            {section.subtitle}
          </span>
        </div>
        <ChevronDown
          className={`h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform ${
            open ? 'rotate-180' : ''
          }`}
        />
      </button>

      {open && (
        <div className="border-t border-border px-3 py-2.5 space-y-2">
          <ul className="space-y-1">
            {section.capabilities.map((cap, i) => (
              <li
                key={i}
                className={`text-[11px] leading-relaxed text-muted-foreground ${
                  cap.startsWith('  ') ? 'pl-3 text-foreground/60' : ''
                }`}
              >
                {cap.startsWith('  ') ? cap : `- ${cap}`}
              </li>
            ))}
          </ul>
          {section.note && (
            <p className="text-[10px] italic text-muted-foreground/60 border-t border-border/50 pt-2">
              {section.note}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export function WikiTab() {
  return (
    <div className="flex-1 overflow-y-auto p-3 space-y-2">
      <p className="text-[11px] text-muted-foreground leading-relaxed pb-1">
        VaporForge surfaces — what each client can do.
      </p>
      {WIKI_SECTIONS.map((section) => (
        <CollapsibleSection key={section.id} section={section} />
      ))}
    </div>
  );
}

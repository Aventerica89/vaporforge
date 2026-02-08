import { useState, useEffect, useCallback } from 'react';
import {
  X,
  Key,
  BookOpen,
  Info,
  Terminal,
  Shield,
  Copy,
  Check,
  ExternalLink,
  FileCode,
  Save,
  Loader2,
  Server,
} from 'lucide-react';
import { APP_VERSION } from '@/lib/version';
import { userApi } from '@/lib/api';
import { CommandsTab } from '@/components/settings/CommandsTab';
import { McpTab } from '@/components/settings/McpTab';

interface SettingsDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

type Tab = 'claude-md' | 'commands' | 'mcp' | 'guide' | 'secrets' | 'about';

const TABS: Array<{ id: Tab; label: string; icon: React.ReactNode }> = [
  { id: 'claude-md', label: 'CLAUDE.md', icon: <FileCode className="h-4 w-4" /> },
  { id: 'commands', label: 'Commands', icon: <Terminal className="h-4 w-4" /> },
  { id: 'mcp', label: 'MCP', icon: <Server className="h-4 w-4" /> },
  { id: 'guide', label: 'Guide', icon: <BookOpen className="h-4 w-4" /> },
  { id: 'secrets', label: 'Secrets', icon: <Key className="h-4 w-4" /> },
  { id: 'about', label: 'About', icon: <Info className="h-4 w-4" /> },
];

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button
      onClick={handleCopy}
      className="ml-2 inline-flex items-center rounded p-1 hover:bg-accent transition-colors"
      title="Copy to clipboard"
    >
      {copied ? (
        <Check className="h-3.5 w-3.5 text-green-400" />
      ) : (
        <Copy className="h-3.5 w-3.5 text-muted-foreground" />
      )}
    </button>
  );
}

function CodeSnippet({ children }: { children: string }) {
  return (
    <div className="flex items-center rounded-lg bg-muted px-3 py-2 font-mono text-xs">
      <code className="flex-1 text-primary break-all">{children}</code>
      <CopyButton text={children} />
    </div>
  );
}

function ClaudeMdTab() {
  const [content, setContent] = useState('');
  const [savedContent, setSavedContent] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saved' | 'error'>('idle');

  const isDirty = content !== savedContent;

  const loadContent = useCallback(async () => {
    setIsLoading(true);
    try {
      const result = await userApi.getClaudeMd();
      if (result.success && result.data) {
        setContent(result.data.content);
        setSavedContent(result.data.content);
      }
    } catch {
      // Failed to load — start with empty
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadContent();
  }, [loadContent]);

  const handleSave = async () => {
    setIsSaving(true);
    setSaveStatus('idle');
    try {
      const result = await userApi.saveClaudeMd(content);
      if (result.success) {
        setSavedContent(content);
        setSaveStatus('saved');
        setTimeout(() => setSaveStatus('idle'), 2000);
      } else {
        setSaveStatus('error');
      }
    } catch {
      setSaveStatus('error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 's') {
      e.preventDefault();
      if (isDirty && !isSaving) {
        handleSave();
      }
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-5 w-5 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col gap-3">
      <section className="space-y-1.5">
        <h3 className="flex items-center gap-2 font-display text-sm font-bold uppercase tracking-wider text-foreground">
          <FileCode className="h-4 w-4 text-primary" />
          Global CLAUDE.md
        </h3>
        <p className="text-xs text-muted-foreground leading-relaxed">
          Instructions injected into every new sandbox session at{' '}
          <code className="text-primary">~/.claude/CLAUDE.md</code>.
          Claude will follow these across all your workspaces.
        </p>
      </section>

      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={CLAUDE_MD_PLACEHOLDER}
        className="flex-1 min-h-[240px] w-full resize-none rounded-lg border border-border bg-muted p-3 font-mono text-xs text-foreground placeholder:text-muted-foreground/50 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
        spellCheck={false}
      />

      <div className="flex items-center justify-between">
        <span className="text-[10px] tabular-nums text-muted-foreground/60">
          {content.length.toLocaleString()} chars
          {isDirty && ' (unsaved)'}
        </span>

        <div className="flex items-center gap-2">
          {saveStatus === 'saved' && (
            <span className="flex items-center gap-1 text-xs text-success">
              <Check className="h-3 w-3" />
              Saved
            </span>
          )}
          {saveStatus === 'error' && (
            <span className="text-xs text-error">Save failed</span>
          )}
          <button
            onClick={handleSave}
            disabled={!isDirty || isSaving}
            className="btn-primary flex items-center gap-1.5 px-3 py-1.5 text-xs disabled:opacity-50"
          >
            {isSaving ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Save className="h-3 w-3" />
            )}
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

const CLAUDE_MD_PLACEHOLDER = `# My Global Instructions

## Coding Style
- Use TypeScript strict mode
- Prefer functional patterns
- Write tests for new features

## Project Conventions
- Conventional commits (feat:, fix:, etc.)
- Max 400 lines per file

## Rules
- Never commit .env files
- Always validate user input`;

function GuideTab() {
  return (
    <div className="space-y-5">
      <section className="space-y-2">
        <h3 className="flex items-center gap-2 font-display text-sm font-bold uppercase tracking-wider text-foreground">
          <Terminal className="h-4 w-4 text-primary" />
          Getting Started
        </h3>
        <p className="text-sm text-muted-foreground leading-relaxed">
          VaporForge gives you a full Claude Code environment in the cloud.
          Type natural language in the chat to build, edit, and run code.
        </p>
        <ul className="space-y-1.5 text-sm text-muted-foreground">
          <li className="flex gap-2">
            <span className="text-primary shrink-0">1.</span>
            <span>Create a new session or clone a repo</span>
          </li>
          <li className="flex gap-2">
            <span className="text-primary shrink-0">2.</span>
            <span>Ask Claude to build, fix, or explain code</span>
          </li>
          <li className="flex gap-2">
            <span className="text-primary shrink-0">3.</span>
            <span>Use the terminal for shell commands</span>
          </li>
          <li className="flex gap-2">
            <span className="text-primary shrink-0">4.</span>
            <span>Browse and edit files in the editor</span>
          </li>
        </ul>
      </section>

      <section className="space-y-2">
        <h3 className="flex items-center gap-2 font-display text-sm font-bold uppercase tracking-wider text-foreground">
          Keyboard Shortcuts
        </h3>
        <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
          <div className="text-muted-foreground">Send message</div>
          <div className="font-mono text-xs text-foreground">Enter</div>
          <div className="text-muted-foreground">Send message (alt)</div>
          <div className="font-mono text-xs text-foreground">Cmd/Ctrl + Enter</div>
          <div className="text-muted-foreground">New line</div>
          <div className="font-mono text-xs text-foreground">Shift + Enter</div>
          <div className="text-muted-foreground">Save file</div>
          <div className="font-mono text-xs text-foreground">Cmd/Ctrl + S</div>
          <div className="text-muted-foreground">Toggle files</div>
          <div className="font-mono text-xs text-foreground">Cmd/Ctrl + 1</div>
          <div className="text-muted-foreground">Toggle terminal</div>
          <div className="font-mono text-xs text-foreground">Cmd/Ctrl + 2</div>
          <div className="text-muted-foreground">Toggle chat</div>
          <div className="font-mono text-xs text-foreground">Cmd/Ctrl + 3</div>
        </div>
      </section>

      <section className="space-y-2">
        <h3 className="flex items-center gap-2 font-display text-sm font-bold uppercase tracking-wider text-foreground">
          Tips
        </h3>
        <ul className="space-y-1.5 text-sm text-muted-foreground">
          <li className="flex gap-2">
            <span className="text-primary shrink-0">-</span>
            <span>Sessions persist across browser reloads</span>
          </li>
          <li className="flex gap-2">
            <span className="text-primary shrink-0">-</span>
            <span>Claude can read and edit any file in /workspace</span>
          </li>
          <li className="flex gap-2">
            <span className="text-primary shrink-0">-</span>
            <span>Use "Clone Repo" to import existing projects</span>
          </li>
          <li className="flex gap-2">
            <span className="text-primary shrink-0">-</span>
            <span>After an error, just resend — sessions auto-resume</span>
          </li>
        </ul>
      </section>
    </div>
  );
}

function SecretsTab() {
  return (
    <div className="space-y-5">
      <section className="space-y-2">
        <h3 className="flex items-center gap-2 font-display text-sm font-bold uppercase tracking-wider text-foreground">
          <Shield className="h-4 w-4 text-primary" />
          1Password Integration
        </h3>
        <p className="text-sm text-muted-foreground leading-relaxed">
          Your sandbox has access to secrets stored in the{' '}
          <span className="font-semibold text-foreground">App Dev</span> vault
          via 1Password service account.
        </p>
      </section>

      <section className="space-y-3">
        <h3 className="font-display text-sm font-bold uppercase tracking-wider text-foreground">
          Reading Secrets
        </h3>
        <p className="text-sm text-muted-foreground">
          Ask Claude or run in the terminal:
        </p>
        <CodeSnippet>op vault list</CodeSnippet>
        <CodeSnippet>
          op read "op://App Dev/SECRET_NAME/credential"
        </CodeSnippet>
        <p className="text-xs text-muted-foreground">
          Replace <code className="text-primary">SECRET_NAME</code> with
          the item title in your App Dev vault.
        </p>
      </section>

      <section className="space-y-3">
        <h3 className="font-display text-sm font-bold uppercase tracking-wider text-foreground">
          Adding New Secrets
        </h3>
        <ol className="space-y-1.5 text-sm text-muted-foreground">
          <li className="flex gap-2">
            <span className="text-primary shrink-0">1.</span>
            <span>
              Open the 1Password app on any device
            </span>
          </li>
          <li className="flex gap-2">
            <span className="text-primary shrink-0">2.</span>
            <span>
              Add a new item to the{' '}
              <span className="font-semibold text-foreground">App Dev</span> vault
            </span>
          </li>
          <li className="flex gap-2">
            <span className="text-primary shrink-0">3.</span>
            <span>It's immediately available in your sandbox</span>
          </li>
        </ol>
        <p className="text-xs text-muted-foreground italic">
          No redeployment or terminal access needed.
        </p>
      </section>

      <section className="space-y-3">
        <h3 className="font-display text-sm font-bold uppercase tracking-wider text-foreground">
          Creating .env Files
        </h3>
        <p className="text-sm text-muted-foreground">
          Ask Claude to set up your project's environment:
        </p>
        <div className="rounded-lg bg-muted p-3 font-mono text-xs text-muted-foreground leading-relaxed">
          <span className="text-primary">"</span>
          Read the secrets from the App Dev vault and
          create a .env.local for this project
          <span className="text-primary">"</span>
        </div>
      </section>

      <section className="space-y-2">
        <h3 className="font-display text-sm font-bold uppercase tracking-wider text-foreground">
          Security
        </h3>
        <ul className="space-y-1.5 text-sm text-muted-foreground">
          <li className="flex gap-2">
            <span className="text-primary shrink-0">-</span>
            <span>Service account has read-only access to App Dev vault only</span>
          </li>
          <li className="flex gap-2">
            <span className="text-primary shrink-0">-</span>
            <span>No access to Personal, Business, or Work vaults</span>
          </li>
          <li className="flex gap-2">
            <span className="text-primary shrink-0">-</span>
            <span>Secrets are passed via env vars, not persisted to disk</span>
          </li>
        </ul>
      </section>
    </div>
  );
}

function AboutTab() {
  return (
    <div className="space-y-5">
      <section className="space-y-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 border border-primary/30">
            <Terminal className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h3 className="font-display text-sm font-bold uppercase tracking-wider text-foreground">
              VaporForge
            </h3>
            <p className="font-mono text-xs text-muted-foreground">
              v{APP_VERSION}
            </p>
          </div>
        </div>
        <p className="text-sm text-muted-foreground leading-relaxed">
          Web-based Claude Code IDE on Cloudflare Sandboxes.
          Access Claude from any device using your existing Pro/Max subscription.
        </p>
      </section>

      <section className="space-y-2">
        <h3 className="font-display text-sm font-bold uppercase tracking-wider text-foreground">
          Architecture
        </h3>
        <div className="rounded-lg bg-muted p-3 font-mono text-xs text-muted-foreground leading-relaxed space-y-1">
          <div>Browser &rarr; Cloudflare Worker &rarr; Sandbox Container</div>
          <div className="pl-8">&darr;</div>
          <div className="pl-8">Claude Agent SDK &rarr; Anthropic API</div>
        </div>
      </section>

      <section className="space-y-2">
        <h3 className="font-display text-sm font-bold uppercase tracking-wider text-foreground">
          Stack
        </h3>
        <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
          <div className="text-muted-foreground">Backend</div>
          <div className="text-foreground">Cloudflare Workers + Sandboxes</div>
          <div className="text-muted-foreground">Frontend</div>
          <div className="text-foreground">React + Vite + Tailwind</div>
          <div className="text-muted-foreground">Auth</div>
          <div className="text-foreground">Claude OAuth (setup-token)</div>
          <div className="text-muted-foreground">Secrets</div>
          <div className="text-foreground">1Password Service Account</div>
          <div className="text-muted-foreground">Storage</div>
          <div className="text-foreground">Cloudflare KV + R2</div>
        </div>
      </section>

      <a
        href="https://github.com/Aventerica89/vaporforge"
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-2 text-sm text-primary hover:underline"
      >
        <ExternalLink className="h-3.5 w-3.5" />
        View on GitHub
      </a>
    </div>
  );
}

const TAB_CONTENT: Record<Tab, () => JSX.Element> = {
  'claude-md': ClaudeMdTab,
  commands: CommandsTab,
  mcp: McpTab,
  guide: GuideTab,
  secrets: SecretsTab,
  about: AboutTab,
};

export function SettingsDialog({ isOpen, onClose }: SettingsDialogProps) {
  const [activeTab, setActiveTab] = useState<Tab>('claude-md');

  if (!isOpen) return null;

  const TabContent = TAB_CONTENT[activeTab];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

      {/* Dialog */}
      <div
        className="glass-card relative w-full max-w-lg max-h-[80vh] flex flex-col animate-scale-in"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 className="font-display text-lg font-bold uppercase tracking-wider text-primary">
            Settings
          </h2>
          <button
            onClick={onClose}
            className="rounded-md p-1.5 hover:bg-accent transition-colors"
          >
            <X className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex overflow-x-auto border-b border-border px-5 scrollbar-none">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 whitespace-nowrap px-3 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${
                activeTab === tab.id
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          <TabContent />
        </div>
      </div>
    </div>
  );
}

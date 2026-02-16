import {
  Terminal, FileCode, ScrollText, Bot, Server,
  Puzzle, Key, Settings, Zap, Sparkles,
  MessageSquare, Wrench, Bug, Keyboard, Square,
} from 'lucide-react';

function Section({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-2">
      <h3 className="flex items-center gap-2 font-display text-sm font-bold uppercase tracking-wider text-foreground">
        {icon}
        {title}
      </h3>
      {children}
    </section>
  );
}

function Tip({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex gap-2">
      <span className="text-primary shrink-0">-</span>
      <span>{children}</span>
    </li>
  );
}

function Shortcut({ keys, label }: { keys: string; label: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-sm text-muted-foreground">{label}</span>
      <kbd className="shrink-0 rounded border border-border bg-muted/50 px-1.5 py-0.5 font-mono text-[10px] text-foreground">
        {keys}
      </kbd>
    </div>
  );
}

export function GuideTab() {
  return (
    <div className="space-y-6">
      <Section icon={<Terminal className="h-4 w-4 text-primary" />} title="Getting Started">
        <p className="text-sm text-muted-foreground leading-relaxed">
          VaporForge gives you a full Claude Code environment in the cloud.
          Each session runs in an isolated container with its own filesystem, terminal, and Claude SDK.
        </p>
        <ol className="space-y-1.5 text-sm text-muted-foreground list-none">
          {['Create a new session or clone a repo',
            'Ask Claude to build, fix, or explain code',
            'Use the terminal for shell commands',
            'Browse and edit files in the editor',
            'Use Quick Chat for fast AI questions without a session',
          ].map((step, i) => (
            <li key={i} className="flex gap-2">
              <span className="text-primary shrink-0">{i + 1}.</span>
              <span>{step}</span>
            </li>
          ))}
        </ol>
      </Section>

      <Section icon={<MessageSquare className="h-4 w-4 text-primary" />} title="Chat & AI Tools">
        <p className="text-sm text-muted-foreground leading-relaxed">
          The main chat connects to Claude running inside your sandbox container.
          Messages support <strong className="text-foreground">LaTeX math</strong> (inline{' '}
          <code className="text-primary">$E=mc^2$</code> and block{' '}
          <code className="text-primary">$$...$$</code>), streaming markdown,
          and code blocks with syntax highlighting.
        </p>
        <div className="space-y-1.5 text-sm text-muted-foreground">
          <p className="font-medium text-foreground text-xs">Built-in AI tools:</p>
          <ul className="space-y-1">
            <Tip>
              <strong className="text-foreground">Quick Chat</strong> (<code className="text-primary">Cmd+Shift+Q</code>) —
              Fast AI questions in a slide-out panel. When a sandbox is active, it becomes an agent
              that can read files, search code, and run commands.
            </Tip>
            <Tip>
              <strong className="text-foreground">Code Transform</strong> (<code className="text-primary">Cmd+Shift+T</code>) —
              Describe a transformation and see a side-by-side diff. Supports Claude and Gemini.
            </Tip>
            <Tip>
              <strong className="text-foreground">Code Analysis</strong> (<code className="text-primary">Cmd+Shift+A</code>) —
              Structured analysis with complexity scoring, issue severity badges, and suggestions.
            </Tip>
            <Tip>
              <strong className="text-foreground">Smart Commit</strong> (<code className="text-primary">Cmd+Shift+M</code>) —
              Generate conventional commit messages with editable type, scope, and body.
            </Tip>
          </ul>
        </div>
        <p className="text-xs text-muted-foreground/60 leading-relaxed">
          Quick Chat and Code Transform require a Claude API key
          (Settings &gt; Secrets &gt; <code className="text-primary">ANTHROPIC_API_KEY</code>).
          This is separate from your OAuth login token.
        </p>
      </Section>

      <Section icon={<Square className="h-4 w-4 text-primary" />} title="Streaming & Stop">
        <p className="text-sm text-muted-foreground leading-relaxed">
          While Claude is streaming a response, a <strong className="text-foreground">Stop</strong> button appears.
          Click it to abort the stream -- your partial response is kept as a regular message.
          Completed messages show <strong className="text-foreground">Copy</strong>,{' '}
          <strong className="text-foreground">Retry</strong>, and feedback buttons (thumbs up/down).
        </p>
        <p className="text-sm text-muted-foreground leading-relaxed">
          When Claude uses 3 or more tools in a single response, a{' '}
          <strong className="text-foreground">Task Plan</strong> timeline appears above the tool details,
          grouping steps by phase (Exploring, Implementing, Testing, Committing).
        </p>
      </Section>

      <Section icon={<Settings className="h-4 w-4 text-primary" />} title="How Config Works">
        <p className="text-sm text-muted-foreground leading-relaxed">
          Your settings are stored in the cloud (KV) and injected into every new container when a session starts.
          This means config changes apply to <strong className="text-foreground">new sessions only</strong> --
          existing sessions keep the config they started with.
        </p>
        <div className="rounded-lg border border-border bg-muted/50 p-3 text-xs text-muted-foreground font-mono leading-relaxed">
          Settings (KV) --&gt; Session Created --&gt; Files written to container<br />
          ~/.claude/CLAUDE.md &nbsp;&nbsp;(global instructions)<br />
          ~/.claude/rules/*.md &nbsp;(behavioral rules)<br />
          ~/.claude/commands/*.md (slash commands)<br />
          ~/.claude/agents/*.md &nbsp;(custom agents)<br />
          ~/.claude.json &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;(MCP servers)
        </div>
      </Section>

      <Section icon={<FileCode className="h-4 w-4 text-primary" />} title="CLAUDE.md">
        <p className="text-sm text-muted-foreground leading-relaxed">
          Your global instructions file. Claude reads this at the start of every conversation.
          Use it for project context, coding standards, and persistent instructions.
          VaporForge rules from Command Center are prepended automatically.
        </p>
      </Section>

      <Section icon={<ScrollText className="h-4 w-4 text-primary" />} title="Rules">
        <p className="text-sm text-muted-foreground leading-relaxed">
          Behavioral rules that constrain how Claude responds. Each rule is a markdown file
          placed in <code className="text-primary">~/.claude/rules/</code>. Examples: coding style,
          security policies, naming conventions, testing requirements.
        </p>
      </Section>

      <Section icon={<Terminal className="h-4 w-4 text-primary" />} title="Commands">
        <p className="text-sm text-muted-foreground leading-relaxed">
          Custom slash commands you can invoke in chat with <code className="text-primary">/command-name</code>.
          Each command is a markdown file that defines a prompt template.
          Built-in commands include /review, /test, /docs, and /refactor with detailed prompts.
        </p>
      </Section>

      <Section icon={<Bot className="h-4 w-4 text-primary" />} title="Agents">
        <p className="text-sm text-muted-foreground leading-relaxed">
          Custom agent definitions for specialized tasks. Agents define a role, capabilities,
          and available tools. Claude can spawn agents when it needs focused expertise.
          Install agents from plugins or create your own.
        </p>
      </Section>

      <Section icon={<Server className="h-4 w-4 text-primary" />} title="MCP Servers">
        <p className="text-sm text-muted-foreground leading-relaxed">
          Connect external tools via the Model Context Protocol. Supports HTTP (remote servers),
          stdio (local processes), and relay (bridge local servers to cloud via WebSocket).
          Paste JSON configs from Claude Code or Warp with auto-format detection.
        </p>
        <ul className="space-y-1 text-sm text-muted-foreground">
          <Tip><strong className="text-foreground">Credential files</strong> — Upload service account JSON, PEM keys, etc. per server</Tip>
          <Tip><strong className="text-foreground">Tool discovery</strong> — Ping servers to see available tools as pill badges</Tip>
          <Tip><strong className="text-foreground">Custom headers</strong> — Add auth headers for HTTP servers</Tip>
          <Tip><strong className="text-foreground">Env vars</strong> — Set environment variables for stdio servers</Tip>
        </ul>
      </Section>

      <Section icon={<Puzzle className="h-4 w-4 text-primary" />} title="Plugins vs Standalone">
        <p className="text-sm text-muted-foreground leading-relaxed">
          <strong className="text-foreground">Plugins</strong> are bundles that can contain agents,
          commands, rules, and MCP servers together. Install from the marketplace catalog (140+ plugins)
          or add from a GitHub repo. Toggle individual items within a plugin.
        </p>
        <p className="text-sm text-muted-foreground leading-relaxed">
          <strong className="text-foreground">Standalone files</strong> (Rules/Commands/Agents tabs)
          are your own custom files, independent of any plugin.
          They take priority over plugin files with the same filename.
        </p>
      </Section>

      <Section icon={<Key className="h-4 w-4 text-primary" />} title="Secrets & 1Password">
        <p className="text-sm text-muted-foreground leading-relaxed">
          Environment variables injected into every session container. Use for API keys, tokens,
          and credentials your code needs. Secrets are encrypted in KV and never exposed to the frontend.
        </p>
        <div className="space-y-1.5 text-sm text-muted-foreground mt-3">
          <p className="font-medium text-foreground text-xs">1Password Integration:</p>
          <p className="text-xs leading-relaxed">
            Add <code className="text-primary">OP_SERVICE_ACCOUNT_TOKEN</code> to your secrets
            (Settings &gt; Secrets) to enable 1Password CLI access inside the container.
          </p>
          <div className="rounded-lg border border-border bg-muted/50 p-3 text-xs text-muted-foreground font-mono leading-relaxed space-y-1.5">
            <p className="text-foreground">Usage in chat:</p>
            <p className="text-primary">Ask Claude: &quot;read my API key from 1Password&quot;</p>
            <p className="text-foreground">Direct terminal usage:</p>
            <p className="text-primary">op read &quot;op://Vault/Item/field&quot;</p>
          </div>
        </div>
      </Section>

      <Section icon={<Sparkles className="h-4 w-4 text-primary" />} title="AI Providers (Gemini)">
        <p className="text-sm text-muted-foreground leading-relaxed">
          Connect additional AI models alongside Claude. Currently supports{' '}
          <strong className="text-foreground">Google Gemini</strong> with a free tier (1,000 requests/day).
          Claude remains your primary agent and can delegate specific tasks to Gemini.
        </p>
        <div className="space-y-1.5 text-sm text-muted-foreground">
          <p className="font-medium text-foreground text-xs">Available Gemini tools:</p>
          <ul className="space-y-1">
            <Tip><code className="text-primary">gemini_quick_query</code> — Fast Q&amp;A using Gemini Flash</Tip>
            <Tip><code className="text-primary">gemini_analyze_code</code> — Deep code review using Gemini Pro</Tip>
            <Tip><code className="text-primary">gemini_codebase_analysis</code> — Multi-file analysis using Gemini Pro</Tip>
          </ul>
        </div>
        <div className="rounded-lg border border-border bg-muted/50 p-3 text-xs text-muted-foreground leading-relaxed space-y-1.5">
          <p><strong className="text-foreground">Setup:</strong> Settings &gt; AI Providers &gt; add your Gemini API key &gt; toggle ON</p>
          <p><strong className="text-foreground">Agent mode:</strong> Type <code className="text-primary">/agent:gemini-expert</code> in chat</p>
          <p><strong className="text-foreground">Free key:</strong>{' '}
            <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">aistudio.google.com/apikey</a>
          </p>
        </div>
      </Section>

      <Section icon={<Wrench className="h-4 w-4 text-primary" />} title="Command Center">
        <p className="text-sm text-muted-foreground leading-relaxed">
          VaporForge-specific rules prepended to your CLAUDE.md inside every container.
          These include container-aware instructions (file paths, available tools, sandbox constraints)
          that help Claude operate correctly in the cloud environment. Editable in Settings.
        </p>
      </Section>

      <Section icon={<Bug className="h-4 w-4 text-primary" />} title="Dev Tools">
        <p className="text-sm text-muted-foreground leading-relaxed">
          Enable the debug panel by running{' '}
          <code className="text-primary">localStorage.setItem(&apos;vf_debug&apos;, &apos;1&apos;)</code> in
          your browser console. A floating bug icon appears with access to:
        </p>
        <ul className="space-y-1 text-sm text-muted-foreground">
          <Tip><strong className="text-foreground">Log</strong> — Console output and error tracking</Tip>
          <Tip><strong className="text-foreground">Wiki</strong> — Documentation of all VaporForge surfaces</Tip>
          <Tip><strong className="text-foreground">Stream</strong> — Real-time WebSocket event log with type filtering</Tip>
          <Tip><strong className="text-foreground">Tokens</strong> — Per-message token estimates with input/output breakdown</Tip>
          <Tip><strong className="text-foreground">Latency</strong> — TTFT, stream duration, and tokens/sec meters</Tip>
        </ul>
      </Section>

      <Section icon={<Keyboard className="h-4 w-4 text-primary" />} title="Key Shortcuts">
        <div className="space-y-1.5">
          <Shortcut keys="Cmd+Shift+Q" label="Quick Chat" />
          <Shortcut keys="Cmd+Shift+T" label="Code Transform" />
          <Shortcut keys="Cmd+Shift+A" label="Code Analysis" />
          <Shortcut keys="Cmd+Shift+M" label="Smart Commit" />
          <Shortcut keys="Cmd+," label="Settings" />
          <Shortcut keys="Cmd+1" label="Toggle sidebar" />
          <Shortcut keys="Cmd+2" label="Toggle right panel" />
          <Shortcut keys="Cmd+3" label="Focus mode" />
          <Shortcut keys="Cmd+Shift+0" label="Reset panels" />
        </div>
        <p className="text-xs text-muted-foreground/60 leading-relaxed mt-2">
          See Settings &gt; Shortcuts for the full list.
        </p>
      </Section>

      <Section icon={<Zap className="h-4 w-4 text-primary" />} title="Tips">
        <ul className="space-y-1.5 text-sm text-muted-foreground">
          <Tip>Sessions persist across browser reloads and auto-resume on reconnect</Tip>
          <Tip>Config changes only apply to new sessions -- create a new one to pick up changes</Tip>
          <Tip>Standalone files override plugin files with the same filename</Tip>
          <Tip>Drag and drop files to upload, or paste images directly in chat</Tip>
          <Tip>Double-click a session tab to rename it</Tip>
          <Tip>Panel sizes are saved automatically -- resize once, keep your layout</Tip>
          <Tip>Click the stop button mid-stream to keep partial responses</Tip>
          <Tip>Claude outputs with LaTeX math render automatically (inline and block)</Tip>
        </ul>
      </Section>
    </div>
  );
}

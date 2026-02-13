import {
  Terminal, FileCode, ScrollText, Bot, Server,
  Puzzle, Key, Settings, Zap, Sparkles,
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
          ].map((step, i) => (
            <li key={i} className="flex gap-2">
              <span className="text-primary shrink-0">{i + 1}.</span>
              <span>{step}</span>
            </li>
          ))}
        </ol>
      </Section>

      <Section icon={<Settings className="h-4 w-4 text-primary" />} title="How Config Works">
        <p className="text-sm text-muted-foreground leading-relaxed">
          Your settings are stored in the cloud (KV) and injected into every new container when a session starts.
          This means config changes apply to <strong className="text-foreground">new sessions only</strong> -- existing sessions keep the config they started with.
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
          Each command is a markdown file that defines a prompt template. Examples: /review, /test, /deploy.
        </p>
      </Section>

      <Section icon={<Bot className="h-4 w-4 text-primary" />} title="Agents">
        <p className="text-sm text-muted-foreground leading-relaxed">
          Custom agent definitions for specialized tasks. Agents define a role, capabilities,
          and available tools. Claude can spawn agents when it needs focused expertise.
        </p>
      </Section>

      <Section icon={<Server className="h-4 w-4 text-primary" />} title="MCP Servers">
        <p className="text-sm text-muted-foreground leading-relaxed">
          Connect external tools via the Model Context Protocol. Supports HTTP (remote servers),
          stdio (local processes), and relay (bridge local servers to cloud via WebSocket).
          Servers are written to <code className="text-primary">~/.claude.json</code> in the container.
        </p>
      </Section>

      <Section icon={<Puzzle className="h-4 w-4 text-primary" />} title="Plugins vs Standalone">
        <p className="text-sm text-muted-foreground leading-relaxed">
          <strong className="text-foreground">Plugins</strong> are bundles that can contain agents, commands, rules, and MCP servers together.
          Install from the catalog or add from a GitHub repo. Toggle individual items within a plugin.
        </p>
        <p className="text-sm text-muted-foreground leading-relaxed">
          <strong className="text-foreground">Standalone files</strong> (Rules/Commands/Agents tabs) are your own custom files,
          independent of any plugin. They take priority over plugin files with the same filename.
        </p>
        <p className="text-sm text-muted-foreground leading-relaxed">
          Both are shown together in the Rules, Commands, and Agents tabs.
          Plugin items appear as read-only with a purple badge -- manage them in the Plugins tab.
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
            Add <code className="text-primary">OP_SERVICE_ACCOUNT_TOKEN</code> to your secrets (Settings &gt; Secrets)
            to enable 1Password CLI access. Claude can then read secrets directly from your 1Password vaults.
          </p>
          <div className="rounded-lg border border-border bg-muted/50 p-3 text-xs text-muted-foreground font-mono leading-relaxed space-y-1.5">
            <p className="text-foreground">Usage in chat:</p>
            <p className="text-primary">Ask Claude: "read my API key from 1Password"</p>
            <p className="text-foreground">Direct terminal usage:</p>
            <p className="text-primary">op read "op://Vault/Item/field"</p>
          </div>
          <p className="text-xs text-amber-400 leading-relaxed mt-2">
            ⚠️ After adding <code>OP_SERVICE_ACCOUNT_TOKEN</code>, create a new session for it to take effect.
            Existing sessions don't receive secret updates.
          </p>
        </div>
      </Section>

      <Section icon={<Sparkles className="h-4 w-4 text-primary" />} title="AI Providers (Gemini)">
        <p className="text-sm text-muted-foreground leading-relaxed">
          Connect additional AI models alongside Claude. Currently supports <strong className="text-foreground">Google Gemini</strong> with
          a free tier (1,000 requests/day). Claude remains your primary agent and can delegate specific tasks to Gemini.
        </p>
        <div className="space-y-1.5 text-sm text-muted-foreground">
          <p className="font-medium text-foreground text-xs">Available Gemini tools:</p>
          <ul className="space-y-1">
            <Tip>
              <code className="text-primary">gemini_quick_query</code> — Fast Q&A using Gemini Flash.
              Ask Claude: <em>&quot;use Gemini to explain how React hooks work&quot;</em>
            </Tip>
            <Tip>
              <code className="text-primary">gemini_analyze_code</code> — Deep code review using Gemini Pro.
              Ask Claude: <em>&quot;have Gemini review this file for security issues&quot;</em>
            </Tip>
            <Tip>
              <code className="text-primary">gemini_codebase_analysis</code> — Multi-file analysis using Gemini Pro.
              Ask Claude: <em>&quot;ask Gemini to analyze the architecture of src/&quot;</em>
            </Tip>
          </ul>
        </div>
        <div className="rounded-lg border border-border bg-muted/50 p-3 text-xs text-muted-foreground leading-relaxed space-y-1.5">
          <p><strong className="text-foreground">Setup:</strong> Settings &gt; AI Providers &gt; add your Gemini API key &gt; toggle ON</p>
          <p><strong className="text-foreground">Agent mode:</strong> Type <code className="text-primary">/agent:gemini-expert</code> in chat to route all queries through Gemini</p>
          <p><strong className="text-foreground">Free key:</strong> Get one at <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">aistudio.google.com/apikey</a></p>
        </div>
      </Section>

      <Section icon={<Zap className="h-4 w-4 text-primary" />} title="Tips">
        <ul className="space-y-1.5 text-sm text-muted-foreground">
          <Tip>Sessions persist across browser reloads and auto-resume on reconnect</Tip>
          <Tip>Config changes (CLAUDE.md, rules, commands, agents, MCP, secrets) only apply to new sessions -- create a new session to pick up changes</Tip>
          <Tip>Standalone files override plugin files with the same filename</Tip>
          <Tip>Disabled items are saved but not injected into containers</Tip>
          <Tip>Drag and drop files to upload, or paste images directly in chat</Tip>
          <Tip>Use Cmd+3 for focus mode (collapse both sidebars)</Tip>
          <Tip>Double-click a session tab to rename it</Tip>
        </ul>
      </Section>
    </div>
  );
}

import { Terminal, ExternalLink, Zap } from 'lucide-react';
import { APP_VERSION, CHANGELOG } from '@/lib/version';
import {
  CloudflareLogo,
  ReactLogo,
  AnthropicLogo,
  ClaudeLogo,
  GeminiLogo,
  GithubLogo,
  StripeLogo,
} from '@/components/logos';

function FeatureChip({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full border border-border bg-muted/50 px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
      {children}
    </span>
  );
}

export function AboutTab() {
  const latest = CHANGELOG[0];

  return (
    <div className="space-y-5">
      {/* Header */}
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
          Cloud-native Claude Code IDE on Cloudflare Sandboxes.
          Full coding environment from any device -- browser, tablet, or phone --
          using your existing Anthropic Pro/Max subscription.
        </p>
      </section>

      {/* Features */}
      <section className="space-y-2">
        <h3 className="font-display text-sm font-bold uppercase tracking-wider text-foreground">
          Features
        </h3>
        <div className="flex flex-wrap gap-1.5">
          <FeatureChip>Claude Agent SDK</FeatureChip>
          <FeatureChip>Tool-calling agent</FeatureChip>
          <FeatureChip>Quick Chat</FeatureChip>
          <FeatureChip>Code Transform</FeatureChip>
          <FeatureChip>Code Analysis</FeatureChip>
          <FeatureChip>Smart Commit</FeatureChip>
          <FeatureChip>LaTeX math</FeatureChip>
          <FeatureChip>Stop streaming</FeatureChip>
          <FeatureChip>Task plan view</FeatureChip>
          <FeatureChip>Monaco editor</FeatureChip>
          <FeatureChip>xterm.js terminal</FeatureChip>
          <FeatureChip>File explorer</FeatureChip>
          <FeatureChip>Image upload</FeatureChip>
          <FeatureChip>Drag-drop files</FeatureChip>
          <FeatureChip>Git clone</FeatureChip>
          <FeatureChip>Plugin marketplace</FeatureChip>
          <FeatureChip>MCP servers</FeatureChip>
          <FeatureChip>MCP credentials</FeatureChip>
          <FeatureChip>WebSocket streaming</FeatureChip>
          <FeatureChip>Gemini integration</FeatureChip>
          <FeatureChip>1Password secrets</FeatureChip>
          <FeatureChip>R2 file storage</FeatureChip>
          <FeatureChip>DevTools</FeatureChip>
          <FeatureChip>Mobile PWA</FeatureChip>
        </div>
      </section>

      {/* Architecture */}
      <section className="space-y-2">
        <h3 className="font-display text-sm font-bold uppercase tracking-wider text-foreground">
          Architecture
        </h3>
        <div className="rounded-lg bg-muted p-3 font-mono text-xs text-muted-foreground leading-relaxed space-y-1">
          <div>Browser &rarr; Cloudflare Worker (Hono) &rarr; Sandbox Container</div>
          <div className="pl-8">&darr;</div>
          <div className="pl-8">Claude Agent SDK &rarr; Anthropic API</div>
          <div className="pl-8">AI SDK v6 &rarr; Claude / Gemini (direct API)</div>
        </div>
      </section>

      {/* Stack */}
      <section className="space-y-2">
        <h3 className="font-display text-sm font-bold uppercase tracking-wider text-foreground">
          Stack
        </h3>
        <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
          <div className="text-muted-foreground">Backend</div>
          <div className="flex items-center gap-1.5 text-foreground">
            <CloudflareLogo className="h-3.5 w-3.5 shrink-0" />
            Cloudflare Workers + Sandboxes
          </div>
          <div className="text-muted-foreground">Frontend</div>
          <div className="flex items-center gap-1.5 text-foreground">
            <ReactLogo className="h-3.5 w-3.5 shrink-0" />
            React 18 + Vite + Tailwind
          </div>
          <div className="text-muted-foreground">AI</div>
          <div className="flex items-center gap-1.5 text-foreground">
            <AnthropicLogo className="h-3.5 w-3.5 shrink-0" />
            Vercel AI SDK v6 + Agent SDK
          </div>
          <div className="text-muted-foreground">Auth</div>
          <div className="flex items-center gap-1.5 text-foreground">
            <ClaudeLogo className="h-3.5 w-3.5 shrink-0" />
            Claude OAuth (setup-token)
          </div>
          <div className="text-muted-foreground">AI Providers</div>
          <div className="flex items-center gap-1.5 text-foreground">
            <GeminiLogo className="h-3.5 w-3.5 shrink-0" />
            Claude (primary) + Gemini (MCP)
          </div>
          <div className="text-muted-foreground">Storage</div>
          <div className="flex items-center gap-1.5 text-foreground">
            <CloudflareLogo className="h-3.5 w-3.5 shrink-0" />
            Cloudflare KV + R2
          </div>
          <div className="text-muted-foreground">Container</div>
          <div className="text-foreground">standard-2 (1 vCPU, 6 GiB)</div>
        </div>
      </section>

      {/* Built with logos */}
      <section className="space-y-2">
        <h3 className="font-display text-sm font-bold uppercase tracking-wider text-foreground">
          Built with
        </h3>
        <div className="flex flex-wrap items-center gap-4">
          {[
            { Logo: CloudflareLogo, label: 'Cloudflare' },
            { Logo: AnthropicLogo, label: 'Anthropic' },
            { Logo: ClaudeLogo, label: 'Claude' },
            { Logo: ReactLogo, label: 'React' },
            { Logo: GeminiLogo, label: 'Gemini' },
            { Logo: GithubLogo, label: 'GitHub' },
            { Logo: StripeLogo, label: 'Stripe' },
          ].map(({ Logo, label }) => (
            <div
              key={label}
              className="flex items-center gap-1.5 text-muted-foreground/60 hover:text-muted-foreground transition-colors"
              title={label}
            >
              <Logo className="h-4 w-4" />
              <span className="text-[10px] font-mono">{label}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Latest changelog */}
      {latest && (
        <section className="space-y-2">
          <h3 className="flex items-center gap-2 font-display text-sm font-bold uppercase tracking-wider text-foreground">
            <Zap className="h-4 w-4 text-primary" />
            Latest: v{latest.version}
          </h3>
          <p className="text-xs font-medium text-muted-foreground">
            {latest.title} ({latest.date})
          </p>
          <ul className="space-y-1">
            {latest.items.slice(0, 6).map((item, i) => (
              <li key={i} className="flex gap-2 text-xs text-muted-foreground leading-relaxed">
                <span className="text-primary shrink-0">-</span>
                <span>{item}</span>
              </li>
            ))}
            {latest.items.length > 6 && (
              <li className="text-xs text-muted-foreground/50">
                ...and {latest.items.length - 6} more
              </li>
            )}
          </ul>
        </section>
      )}

      {/* Links */}
      <div className="flex items-center gap-4 pt-1">
        <a
          href="https://github.com/Aventerica89/VaporForge"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 text-sm text-primary hover:underline"
        >
          <ExternalLink className="h-3.5 w-3.5" />
          GitHub
        </a>
        <a
          href="https://vaporforge.dev"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 text-sm text-primary hover:underline"
        >
          <ExternalLink className="h-3.5 w-3.5" />
          vaporforge.dev
        </a>
      </div>
    </div>
  );
}

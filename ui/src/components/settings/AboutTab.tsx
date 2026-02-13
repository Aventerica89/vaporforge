import { Terminal, ExternalLink } from 'lucide-react';
import { APP_VERSION } from '@/lib/version';

export function AboutTab() {
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
          <div className="text-muted-foreground">AI Providers</div>
          <div className="text-foreground">Claude (primary) + Gemini (MCP)</div>
          <div className="text-muted-foreground">Storage</div>
          <div className="text-foreground">Cloudflare KV + R2</div>
        </div>
      </section>

      <a
        href="https://github.com/Aventerica89/VaporForge"
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

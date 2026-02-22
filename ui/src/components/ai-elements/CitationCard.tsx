import { ExternalLink } from 'lucide-react';
import { cn } from '@/lib/cn';

export type CitationCardProps = {
  url: string;
  content?: string;
  className?: string;
};

function extractDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

function extractTitle(content?: string): string | null {
  if (!content) return null;
  const preview = content.slice(0, 3000);
  const titleMatch = preview.match(/<title[^>]*>([^<]{1,120})<\/title>/i);
  if (titleMatch) return titleMatch[1].trim().replace(/\s+/g, ' ');
  const h1Match = preview.match(/^#\s+(.{1,120})$/m);
  if (h1Match) return h1Match[1].trim();
  return null;
}

function extractSnippet(content: string, maxLen = 180): string {
  const preview = content.slice(0, 4000);
  const stripped = preview
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/#{1,6}\s+/g, '')
    .replace(/\*\*/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return stripped.length > maxLen ? `${stripped.slice(0, maxLen)}\u2026` : stripped;
}

export function CitationCard({ url, content, className }: CitationCardProps) {
  const domain = extractDomain(url);
  const title = extractTitle(content) || domain;
  const snippet = content ? extractSnippet(content) : null;
  const faviconSrc = `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=16`;

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        'group flex flex-col gap-1.5 rounded-lg border border-border/50 bg-muted/20 px-3 py-2.5',
        'no-underline transition-colors hover:border-primary/30 hover:bg-muted/30',
        className,
      )}
    >
      <div className="flex items-center gap-1.5">
        <img
          src={faviconSrc}
          alt=""
          className="size-3.5 shrink-0 rounded-sm opacity-70"
          onError={(e) => {
            (e.currentTarget as HTMLImageElement).style.display = 'none';
          }}
        />
        <span className="font-mono text-[10px] text-muted-foreground">{domain}</span>
        <ExternalLink className="ml-auto size-3 shrink-0 text-muted-foreground/40 opacity-0 transition-opacity group-hover:opacity-100" />
      </div>

      <p className="line-clamp-1 text-xs font-medium leading-snug text-foreground/90">
        {title}
      </p>

      {snippet && (
        <p className="line-clamp-2 text-[11px] leading-relaxed text-muted-foreground">
          {snippet}
        </p>
      )}
    </a>
  );
}

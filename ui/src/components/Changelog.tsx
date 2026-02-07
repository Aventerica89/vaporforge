import { useState } from 'react';
import { APP_VERSION, CHANGELOG, type ChangelogEntry } from '@/lib/version';

const TAG_STYLES: Record<ChangelogEntry['tag'], string> = {
  feature: 'bg-primary/10 text-primary border-primary/30',
  fix: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/30',
  security: 'bg-red-500/10 text-red-400 border-red-500/30',
  breaking: 'bg-orange-500/10 text-orange-400 border-orange-500/30',
};

const TAG_LABELS: Record<ChangelogEntry['tag'], string> = {
  feature: 'NEW',
  fix: 'FIX',
  security: 'SEC',
  breaking: 'BREAKING',
};

export function VersionBadge() {
  return (
    <span className="inline-flex items-center gap-1.5 font-mono text-xs text-muted-foreground">
      <span className="inline-block h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
      v{APP_VERSION}
    </span>
  );
}

export function Changelog() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="animate-fade-up stagger-4">
      <button
        onClick={() => setIsOpen((prev) => !prev)}
        className="group flex w-full items-center justify-center gap-2 text-xs text-muted-foreground font-mono transition-colors hover:text-foreground"
      >
        <VersionBadge />
        <span className="hidden sm:inline">|</span>
        <span className="underline-offset-2 group-hover:underline">
          {isOpen ? 'Hide changelog' : 'View changelog'}
        </span>
        <svg
          className={`h-3 w-3 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && (
        <div className="mt-4 space-y-3 animate-fade-up">
          {CHANGELOG.map((entry) => (
            <div
              key={entry.version}
              className="glass-card p-4 text-left space-y-2"
            >
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-mono text-sm font-bold text-foreground">
                  v{entry.version}
                </span>
                <span
                  className={`inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-mono font-bold uppercase tracking-wider ${TAG_STYLES[entry.tag]}`}
                >
                  {TAG_LABELS[entry.tag]}
                </span>
                <span className="text-xs text-muted-foreground font-mono ml-auto">
                  {entry.date}
                </span>
              </div>
              <p className="text-sm font-semibold text-foreground/90">
                {entry.title}
              </p>
              <ul className="space-y-1">
                {entry.items.map((item, i) => (
                  <li
                    key={i}
                    className="flex gap-2 text-xs text-muted-foreground"
                  >
                    <span className="text-primary mt-0.5 shrink-0">-</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

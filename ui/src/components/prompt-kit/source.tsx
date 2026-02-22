import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from '@/components/ui/hover-card';
import { cn } from '@/lib/cn';
import { createContext, useContext } from 'react';

const SourceContext = createContext<{ href: string; domain: string } | null>(null);

function useSourceContext() {
  const ctx = useContext(SourceContext);
  if (!ctx) throw new Error('Source.* must be used inside <Source>');
  return ctx;
}

export type SourceProps = {
  href: string;
  children: React.ReactNode;
};

export function Source({ href, children }: SourceProps) {
  let domain = '';
  try {
    domain = new URL(href).hostname;
  } catch {
    domain = href.split('/').pop() || href;
  }

  return (
    <SourceContext.Provider value={{ href, domain }}>
      <HoverCard openDelay={150} closeDelay={0}>
        {children}
      </HoverCard>
    </SourceContext.Provider>
  );
}

export type SourceTriggerProps = {
  label?: string | number;
  showFavicon?: boolean;
  className?: string;
};

export function SourceTrigger({ label, showFavicon = false, className }: SourceTriggerProps) {
  const { href, domain } = useSourceContext();
  const labelToShow = label ?? domain.replace('www.', '');

  return (
    <HoverCardTrigger asChild>
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className={cn(
          'bg-muted text-muted-foreground hover:bg-muted-foreground/30 hover:text-primary inline-flex h-5 max-w-32 items-center gap-1 overflow-hidden rounded-full py-0 text-xs no-underline transition-colors duration-150',
          showFavicon ? 'pl-1 pr-2' : 'px-1',
          className,
        )}
      >
        {showFavicon && (
          <img
            src={`https://www.google.com/s2/favicons?sz=64&domain_url=${encodeURIComponent(href)}`}
            alt="favicon"
            width={14}
            height={14}
            className="size-3.5 rounded-full"
          />
        )}
        <span className="truncate text-center font-normal tabular-nums">{labelToShow}</span>
      </a>
    </HoverCardTrigger>
  );
}

export type SourceContentProps = {
  title: string;
  description: string;
  className?: string;
};

export function SourceContent({ title, description, className }: SourceContentProps) {
  const { href, domain } = useSourceContext();

  return (
    <HoverCardContent
      className={cn(
        'relative w-80 overflow-hidden border-purple-500/40 bg-background p-0 shadow-xs',
        'before:pointer-events-none before:absolute before:inset-0 before:z-0',
        'before:bg-[linear-gradient(to_right,#4f4f4f2e_1px,transparent_1px),linear-gradient(to_bottom,#4f4f4f2e_1px,transparent_1px)]',
        'before:bg-[size:24px_24px]',
        'before:[mask-image:radial-gradient(ellipse_80%_80%_at_50%_50%,#000_40%,transparent_100%)]',
        '[&>*]:relative [&>*]:z-10',
        className,
      )}
    >
      <a href={href} target="_blank" rel="noopener noreferrer" className="flex flex-col gap-2 p-3">
        <div className="flex items-center gap-1.5">
          <img
            src={`https://www.google.com/s2/favicons?sz=64&domain_url=${encodeURIComponent(href)}`}
            alt="favicon"
            className="size-4 rounded-full"
            width={16}
            height={16}
          />
          <div className="text-primary truncate text-sm">{domain.replace('www.', '')}</div>
        </div>
        <div className="line-clamp-2 text-sm font-medium">{title}</div>
        <div className="text-muted-foreground line-clamp-2 text-sm">{description}</div>
      </a>
    </HoverCardContent>
  );
}

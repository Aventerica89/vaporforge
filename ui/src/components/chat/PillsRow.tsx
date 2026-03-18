import { useState, useRef, useEffect, useMemo } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { cn } from '@/lib/utils';
import {
  Flame,
  Zap,
  Bookmark,
  ChevronDown,
  Check,
} from 'lucide-react';
import { useSandboxStore } from '@/hooks/useSandbox';
import { AutonomySelectorPopup } from '@/components/AutonomySelectorPopup';
import { useReforge } from '@/hooks/useReforge';
import {
  Context,
  ContextTrigger,
  ContextContent,
  ContextContentHeader,
  ContextContentBody,
  ContextContentFooter,
  ContextInputUsage,
  ContextOutputUsage,
} from '@/components/ai-elements/context';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const AGENT_OPTIONS = [
  { id: 'auto', label: 'Auto', description: 'Best model for each task (default)' },
  { id: 'opus', label: 'Opus 4.6', description: 'Most capable — complex reasoning' },
  { id: 'opusplan', label: 'Opus Plan', description: 'Opus for planning, Sonnet for execution' },
  { id: 'sonnet', label: 'Sonnet 4.6', description: 'Balanced — fast and highly capable' },
  { id: 'sonnet1m', label: 'Sonnet 1M', description: 'Sonnet with 1M context — requires API key (OAuth tokens limited to 200K)' },
  { id: 'haiku', label: 'Haiku 4.5', description: 'Fastest — lightweight tasks' },
] as const;

const GRID_BG = [
  'before:absolute before:inset-0 before:pointer-events-none before:z-0',
  'before:bg-[linear-gradient(to_right,#4f4f4f2e_1px,transparent_1px),linear-gradient(to_bottom,#4f4f4f2e_1px,transparent_1px)]',
  'before:bg-[size:24px_24px]',
  'before:[mask-image:radial-gradient(ellipse_80%_80%_at_50%_50%,#000_40%,transparent_100%)]',
  '[&>*]:relative [&>*]:z-10',
].join(' ');

// ---------------------------------------------------------------------------
// PillsRow
// ---------------------------------------------------------------------------

interface PillsRowProps {
  sessionOpen: boolean;
  onSessionToggle: () => void;
}

export function PillsRow({ sessionOpen, onSessionToggle }: PillsRowProps) {
  const sdkMode = useSandboxStore((s) => s.sdkMode);
  const setMode = useSandboxStore((s) => s.setMode);
  const selectedModel = useSandboxStore((s) => s.selectedModel);
  const setModel = useSandboxStore((s) => s.setModel);
  const autonomyMode = useSandboxStore((s) => s.autonomyMode);
  const setAutonomy = useSandboxStore((s) => s.setAutonomy);
  const messagesById = useSandboxStore((s) => s.messagesById);
  const sessionSummary = useSandboxStore((s) => s.sessionSummary);

  const [agentOpen, setAgentOpen] = useState(false);
  const agentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!agentOpen) return;
    const handler = (e: MouseEvent) => {
      if (agentRef.current && !agentRef.current.contains(e.target as Node)) {
        setAgentOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [agentOpen]);

  const estimatedTokens = useMemo(() => {
    let chars = 0;
    for (const msg of Object.values(messagesById)) {
      chars += msg.content?.length ?? 0;
    }
    return Math.floor(chars / 4);
  }, [messagesById]);

  return (
    <div className="flex w-full flex-wrap items-center justify-start gap-2">
      <div className="hidden md:contents">
        <button
          type="button"
          onClick={() => useReforge.getState().open()}
          className="flex items-center gap-1 rounded-full bg-primary/10 px-3 py-1 text-[10px] font-medium text-primary hover:bg-primary/20 transition-colors"
        >
          <Flame className="h-3 w-3" />
          Reforge
        </button>
        <button
          type="button"
          onClick={() => setMode(sdkMode === 'plan' ? 'agent' : 'plan')}
          className={cn(
            'flex items-center gap-1 rounded-full px-3 py-1 text-[10px] font-medium transition-colors',
            sdkMode === 'plan'
              ? 'bg-primary/15 text-primary'
              : 'bg-primary/10 text-primary hover:bg-primary/20',
          )}
        >
          <Zap className="h-3 w-3" />
          {sdkMode === 'plan' ? 'Plan mode' : 'Auto-pick'}
        </button>
        <button
          type="button"
          onClick={onSessionToggle}
          className={cn(
            'flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-medium transition-colors',
            sessionOpen
              ? 'bg-purple-500/20 text-purple-400'
              : 'bg-muted/50 text-muted-foreground/60 hover:bg-primary/10 hover:text-muted-foreground',
          )}
        >
          <Bookmark className="h-3 w-3" />
          <span>Session</span>
        </button>
      </div>

      {/* Model dropdown */}
      <div ref={agentRef} className="relative">
        <button
          type="button"
          onClick={() => setAgentOpen((v) => !v)}
          className={cn(
            'flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-medium transition-colors',
            agentOpen
              ? 'bg-primary/15 text-primary'
              : 'bg-muted/50 text-muted-foreground/60 hover:bg-primary/10 hover:text-muted-foreground',
          )}
        >
          <Zap className="h-3 w-3" />
          <span>
            {AGENT_OPTIONS.find((a) => a.id === selectedModel)?.label ?? 'Auto'}
          </span>
          <ChevronDown
            className={cn(
              'h-3 w-3 transition-transform duration-150',
              agentOpen && 'rotate-180',
            )}
          />
        </button>
        <AnimatePresence>
          {agentOpen && (
            <motion.div
              key="agent-dropdown"
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 4 }}
              transition={{ duration: 0.15 }}
              className="absolute bottom-full mb-1.5 left-0 z-50 w-52 rounded-xl border border-primary/50 bg-background overflow-hidden"
            >
              <div className={cn('relative', GRID_BG)}>
                <div className="p-1">
                  {AGENT_OPTIONS.map((agent) => (
                    <button
                      key={agent.id}
                      type="button"
                      onClick={() => {
                        setModel(agent.id);
                        setAgentOpen(false);
                      }}
                      className={cn(
                        'flex w-full items-start gap-2 rounded-lg px-2.5 py-2 text-left transition-colors',
                        selectedModel === agent.id
                          ? 'bg-primary/10 text-primary'
                          : 'text-muted-foreground hover:bg-primary/10/50 hover:text-foreground',
                      )}
                    >
                      <div className="flex flex-col min-w-0">
                        <span className="text-[11px] font-medium">
                          {agent.label}
                        </span>
                        <span className="text-[10px] text-muted-foreground">
                          {agent.description}
                        </span>
                      </div>
                      {selectedModel === agent.id && (
                        <Check className="ml-auto h-3 w-3 shrink-0 mt-0.5 text-primary" />
                      )}
                    </button>
                  ))}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <AutonomySelectorPopup selected={autonomyMode} onSelect={setAutonomy} />

      <div className="ml-auto">
        <Context usedTokens={estimatedTokens} maxTokens={200000}>
          <ContextTrigger className="h-auto rounded-full bg-muted/50 px-2.5 py-1 text-[10px] font-medium text-muted-foreground/60 hover:bg-primary/10 hover:text-muted-foreground" />
          <ContextContent
            side="top"
            align="start"
            className={cn(
              'relative border-primary/50 bg-background overflow-hidden',
              GRID_BG,
            )}
          >
            <ContextContentHeader />
            <ContextContentBody className="space-y-1.5">
              <ContextInputUsage />
              <ContextOutputUsage />
            </ContextContentBody>
            {sessionSummary && (
              <ContextContentBody className="space-y-1.5">
                <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/50">
                  Session summary
                </p>
                <p className="text-xs leading-relaxed text-muted-foreground/80 line-clamp-6">
                  {sessionSummary}
                </p>
              </ContextContentBody>
            )}
            <ContextContentFooter />
          </ContextContent>
        </Context>
      </div>
    </div>
  );
}

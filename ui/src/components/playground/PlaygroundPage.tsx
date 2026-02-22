import { useState, useEffect, useRef } from 'react';
import { AnimatePresence, LayoutGroup, motion } from 'motion/react';
import { Flame, Zap, Bookmark, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { BorderTrail } from '@/components/motion-primitives/border-trail';
import { PromptInput } from '@/components/prompt-input';
import { PromptInputTextarea } from '@/components/prompt-input';
import { PromptInputSubmit } from '@/components/prompt-input';
import { PromptInputModeToggle } from '@/components/prompt-input/PromptInputModeToggle';
import { PromptSuggestion } from '@/components/ui/prompt-suggestion';
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
import { ChatPreview } from '@/components/playground/ChatPreview';
import { SessionIsland, type SessionStatus } from '@/components/playground/SessionIsland';
import { cn } from '@/lib/cn';

// ---------------------------------------------------------------------------
// Suggestion data — mirrors Zola's category → items pattern
// ---------------------------------------------------------------------------

const SUGGESTION_GROUPS = [
  {
    label: 'Summary',
    highlight: 'Summarize',
    items: [
      'Summarize a document',
      'Summarize a video',
      'Summarize a podcast',
      'Summarize a book',
    ],
  },
  {
    label: 'Code',
    highlight: 'Help me',
    items: [
      'Help me write React components',
      'Help me debug code',
      'Help me learn Python',
      'Help me learn SQL',
    ],
  },
  {
    label: 'Design',
    highlight: 'Design',
    items: [
      'Design a small logo',
      'Design a hero section',
      'Design a landing page',
      'Design a social media post',
    ],
  },
  {
    label: 'Research',
    highlight: 'Research',
    items: [
      'Research best practices for SEO',
      'Research the best running shoes',
      'Research the best restaurants in Paris',
      'Research the best AI tools',
    ],
  },
] as const;

// ---------------------------------------------------------------------------
// ActionPill — Reforge / Auto-pick style (bg-primary/10 text-primary)
// CategoryPill — suggestion chip style (muted border)
// ---------------------------------------------------------------------------

interface PillProps {
  children: React.ReactNode;
  icon?: React.ElementType;
  onClick?: () => void;
  className?: string;
}

function ActionPill({ children, icon: Icon, onClick, className }: PillProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex items-center gap-1 rounded-full bg-primary/10 px-3 py-1',
        'text-[10px] font-medium text-primary transition-colors hover:bg-primary/20',
        className,
      )}
    >
      {Icon && <Icon className="h-3 w-3" />}
      {children}
    </button>
  );
}


// ---------------------------------------------------------------------------
// useVisualViewport — keyboard-aware height on iOS
// ---------------------------------------------------------------------------

function useVisualViewport() {
  const [vpHeight, setVpHeight] = useState(
    () => window.visualViewport?.height ?? window.innerHeight,
  );
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  const debounceRef = useState<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const vp = window.visualViewport;
    if (!vp) return;
    const screenH = window.screen?.height ?? window.innerHeight;

    const update = () => {
      // height update is immediate — drives the container size
      setVpHeight(vp.height);
      window.scrollTo(0, 0);

      // keyboardOpen flips only after a short settle — prevents layout
      // thrashing on every intermediate resize frame during keyboard animation
      if (debounceRef[0]) clearTimeout(debounceRef[0]);
      debounceRef[0] = setTimeout(() => {
        setKeyboardOpen(vp.height < screenH * 0.75);
      }, 120);
    };

    vp.addEventListener('resize', update);
    vp.addEventListener('scroll', update);
    return () => {
      vp.removeEventListener('resize', update);
      vp.removeEventListener('scroll', update);
      if (debounceRef[0]) clearTimeout(debounceRef[0]);
    };
  }, [debounceRef]);

  return { vpHeight, keyboardOpen };
}

// ---------------------------------------------------------------------------
// PlaygroundPage
// ---------------------------------------------------------------------------

export function PlaygroundPage() {
  const [input, setInput] = useState('');
  const [activeCategory, setActiveCategory] = useState('');
  const [mode, setMode] = useState<'agent' | 'plan'>('agent');
  const [sessionOpen, setSessionOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(true);
  const [status, setStatus] = useState<SessionStatus>('idle');
  const streamTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { vpHeight, keyboardOpen } = useVisualViewport();

  const handleSubmit = (message: string) => {
    setInput('');
    setActiveCategory('');
    setStatus('streaming');
    // Simulate a 4s response then return to idle
    if (streamTimerRef.current) clearTimeout(streamTimerRef.current);
    streamTimerRef.current = setTimeout(() => setStatus('idle'), 4000);
    // eslint-disable-next-line no-console
    console.log('[playground] submit:', message);
  };

  const handleStop = () => {
    if (streamTimerRef.current) clearTimeout(streamTimerRef.current);
    setStatus('idle');
  };

  const handlePause = () => setStatus('paused');
  const handleResume = () => setStatus('streaming');
  const handleNew = () => {
    if (streamTimerRef.current) clearTimeout(streamTimerRef.current);
    setInput('');
    setActiveCategory('');
    setStatus('idle');
  };

  const handleInputChange = (value: string) => {
    setInput(value);
    if (value.trim() === '') setActiveCategory('');
  };

  const activeCategoryData = SUGGESTION_GROUPS.find((g) => g.label === activeCategory);

  // ---------------------------------------------------------------------------
  // Sub-components rendered in both layout modes
  // ---------------------------------------------------------------------------

  const headline = (
    <div className="text-center">
      <h1 className="text-2xl font-medium tracking-tight md:text-3xl">
        What do you want to build?
      </h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Describe a task — Claude will get to work in your sandbox
      </p>
    </div>
  );

  const promptInput = (
    <PromptInput
      input={input}
      onInputChange={handleInputChange}
      onSubmit={handleSubmit}
      onStop={handleStop}
      status={status}
      className={cn(
        'relative z-10 w-full rounded-3xl border bg-card/90 pt-1 backdrop-blur-md !px-0 !pb-0',
        status === 'streaming'
          ? 'border-purple-500/60 shadow-[0_0_20px_-4px_rgba(168,85,247,0.35)]'
          : input.trim().length > 0
            ? 'border-purple-500/60 shadow-[0_0_20px_-4px_rgba(168,85,247,0.35)]'
            : 'border-primary/50 shadow-[0_0_16px_-4px_hsl(var(--primary)/0.25)] hover:border-primary/70 hover:shadow-[0_0_20px_-4px_hsl(var(--primary)/0.35)]',
      )}
    >
      <AnimatePresence>
        {status === 'streaming' && (
          <motion.div
            key="border-trail"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.4 }}
          >
            <BorderTrail
              size={120}
              radius={24}
              className="bg-gradient-to-l from-purple-400/0 via-purple-400 to-purple-400/0"
              transition={{
                ease: 'linear',
                duration: 3,
                repeat: Infinity,
              }}
            />
          </motion.div>
        )}
      </AnimatePresence>
      <PromptInputTextarea
        placeholder="Ask anything..."
        className="min-h-[44px] pl-4 pt-3 text-base leading-[1.3]"
      />
      <div className="mt-2 flex w-full items-end justify-end px-3 pb-3">
        <PromptInputSubmit />
      </div>
    </PromptInput>
  );

  // Suggestions rendered OUTSIDE PromptInput — Zola pattern
  const suggestions = (
    <div className="relative flex w-full flex-col items-center justify-center space-y-2">
      <div className="w-full">
        {activeCategory && activeCategoryData ? (
          <div className="flex w-full flex-col space-y-1">
            {activeCategoryData.items.map((item) => (
              <PromptSuggestion
                key={item}
                highlight={activeCategoryData.highlight}
                onClick={() => setInput(item)}
              >
                {item}
              </PromptSuggestion>
            ))}
          </div>
        ) : (
          <div className="flex w-full flex-wrap items-stretch justify-start gap-2">
            <ActionPill icon={Flame} onClick={() => {}}>Reforge</ActionPill>
            <ActionPill icon={Zap} onClick={() => {}}>Auto-pick</ActionPill>
            {/* Session toggle */}
            <button
              type="button"
              onClick={() => setSessionOpen((v) => !v)}
              className={cn(
                'flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-medium transition-colors',
                sessionOpen
                  ? 'bg-purple-500/20 text-purple-400'
                  : 'bg-muted/50 text-muted-foreground/60 hover:bg-muted hover:text-muted-foreground',
              )}
            >
              <Bookmark className="h-3 w-3" />
              <span>Session</span>
            </button>
            {/* Agent / Plan mode toggle */}
            <PromptInputModeToggle mode={mode} onModeChange={setMode} />
            {/* Context usage indicator — pushed to far right */}
            <div className="ml-auto">
            <Context usedTokens={12400} maxTokens={200000}>
              <ContextTrigger className="h-auto rounded-full bg-muted/50 px-2.5 py-1 text-[10px] font-medium text-muted-foreground/60 hover:bg-muted hover:text-muted-foreground" />
              <ContextContent
                side="top"
                align="start"
                className="relative border-primary/50 bg-background overflow-hidden
                  before:absolute before:inset-0 before:pointer-events-none before:z-0
                  before:bg-[linear-gradient(to_right,#4f4f4f2e_1px,transparent_1px),linear-gradient(to_bottom,#4f4f4f2e_1px,transparent_1px)]
                  before:bg-[size:24px_24px]
                  before:[mask-image:radial-gradient(ellipse_80%_80%_at_50%_50%,#000_40%,transparent_100%)]
                  [&>*]:relative [&>*]:z-10"
              >
                <ContextContentHeader />
                <ContextContentBody className="space-y-1.5">
                  <ContextInputUsage />
                  <ContextOutputUsage />
                </ContextContentBody>
                <ContextContentFooter />
              </ContextContent>
            </Context>
            </div>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div
      className="relative w-full overflow-hidden bg-background"
      style={{ height: vpHeight }}
    >
      {/* Grid background — 1:1 square cells */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#4f4f4f2e_1px,transparent_1px),linear-gradient(to_bottom,#4f4f4f2e_1px,transparent_1px)] bg-[size:24px_24px] [mask-image:radial-gradient(ellipse_80%_50%_at_50%_0%,#000_70%,transparent_110%)]" />

      {/* Desktop: side-by-side chat preview + prompt */}
      <div className={cn(
        'absolute inset-0 flex gap-0 overflow-hidden',
        'transition-opacity duration-200 will-change-[opacity]',
        keyboardOpen ? 'pointer-events-none opacity-0' : 'opacity-100',
      )}>
        {/* Chat preview panel — collapses out */}
        <div className={cn(
          'overflow-hidden border-r border-border/30',
          'transition-[flex,opacity] duration-300 ease-in-out',
          previewOpen ? 'flex-1 opacity-100' : 'flex-[0] opacity-0 pointer-events-none',
        )}>
          {/* Close button */}
          <div className="absolute left-2 top-2 z-20">
            <button
              type="button"
              onClick={() => setPreviewOpen(false)}
              className="flex items-center gap-1 rounded-full bg-muted/50 px-2.5 py-1 text-[10px] font-medium text-muted-foreground/60 transition-colors hover:bg-muted hover:text-muted-foreground"
            >
              <PanelLeftClose className="h-3 w-3" />
              <span>Close preview</span>
            </button>
          </div>
          <ChatPreview status={status} />
        </div>

        <div className={cn(
          'flex flex-col items-center justify-center px-3 pb-3 md:px-5 md:pb-5 mx-auto',
          'transition-[max-width] duration-300 ease-in-out',
          previewOpen ? 'w-full max-w-md' : 'w-full max-w-2xl',
        )}>
          <LayoutGroup id="playground-stack">
            <div className="flex w-full -translate-y-[5%] flex-col items-center gap-4">
              {/* Re-open preview button — only when closed */}
              {!previewOpen && (
                <button
                  type="button"
                  onClick={() => setPreviewOpen(true)}
                  className="flex items-center gap-1 self-start rounded-full bg-muted/50 px-2.5 py-1 text-[10px] font-medium text-muted-foreground/60 transition-colors hover:bg-muted hover:text-muted-foreground"
                >
                  <PanelLeftOpen className="h-3 w-3" />
                  <span>Show preview</span>
                </button>
              )}

              <motion.div layout transition={{ type: 'spring', stiffness: 400, damping: 40 }}>
                {headline}
              </motion.div>

              <motion.div layout transition={{ type: 'spring', stiffness: 400, damping: 40 }}>
                <SessionIsland
                  status={status}
                  controlsOpen={sessionOpen}
                  onNew={handleNew}
                  onPause={handlePause}
                  onResume={handleResume}
                  onStop={handleStop}
                />
              </motion.div>

              <motion.div layout className="w-full" transition={{ type: 'spring', stiffness: 400, damping: 40 }}>
                {promptInput}
              </motion.div>

              <motion.div layout className="w-full" transition={{ type: 'spring', stiffness: 400, damping: 40 }}>
                {suggestions}
              </motion.div>
            </div>
          </LayoutGroup>
        </div>
      </div>

      {/* Mobile keyboard-open: input pinned to keyboard top
          Animates in/out with transform only — no layout recalculation */}
      <div className={cn(
        'absolute inset-x-0 bottom-0 px-3 pb-2',
        'transition-[opacity,transform] duration-200 will-change-[opacity,transform]',
        keyboardOpen
          ? 'translate-y-0 opacity-100'
          : 'pointer-events-none translate-y-4 opacity-0',
      )}>
        <div className="mx-auto max-w-3xl space-y-2">
          {suggestions}
          {promptInput}
        </div>
      </div>
    </div>
  );
}

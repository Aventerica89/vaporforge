import { useState, useEffect, useRef } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Flame, Eye, Zap, Paperclip, Bookmark, MoreHorizontal, PanelLeftClose, PanelLeftOpen, ChevronDown, Check } from 'lucide-react';
import { AutonomySelectorPopup } from '@/components/prompt-input/AutonomySelectorPopup';
import type { AutonomyMode } from '@/components/prompt-input/AutonomySelectorPopup';
import { BorderTrail } from '@/components/motion-primitives/border-trail';
import { PromptInput } from '@/components/prompt-input';
import { PromptInputTextarea } from '@/components/prompt-input';
import { PromptInputSubmit } from '@/components/prompt-input';

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
import { MobileTabBar, type MobileTab } from '@/components/mobile/MobileTabBar';
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
// Agent options — shown in the agent selector dropdown
// ---------------------------------------------------------------------------

const AGENT_OPTIONS = [
  { id: 'opus', label: 'Opus 4.6', description: 'Most capable — complex reasoning and tasks' },
  { id: 'sonnet', label: 'Sonnet 4.6', description: 'Balanced — fast and highly capable' },
  { id: 'haiku', label: 'Haiku 4.5', description: 'Fastest — lightweight tasks and quick edits' },
] as const;

type AgentId = typeof AGENT_OPTIONS[number]['id'];

// Shared grid overlay applied to floating panels
const GRID_BG = [
  'before:absolute before:inset-0 before:pointer-events-none before:z-0',
  'before:bg-[linear-gradient(to_right,#4f4f4f2e_1px,transparent_1px),linear-gradient(to_bottom,#4f4f4f2e_1px,transparent_1px)]',
  'before:bg-[size:24px_24px]',
  'before:[mask-image:radial-gradient(ellipse_80%_80%_at_50%_50%,#000_40%,transparent_100%)]',
  '[&>*]:relative [&>*]:z-10',
].join(' ');


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
  const [sessionOpen, setSessionOpen] = useState(false);
  const [selectedAgent, setSelectedAgent] = useState<AgentId>('sonnet');
  const [agentOpen, setAgentOpen] = useState(false);
  const agentRef = useRef<HTMLDivElement>(null);
  const [autonomy, setAutonomy] = useState<AutonomyMode>('standard');
  const [agentMode, setAgentMode] = useState<'plan' | 'agent'>('agent');

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
  const [previewOpen, setPreviewOpen] = useState(true);
  const [status, setStatus] = useState<SessionStatus>('idle');
  const streamTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [activeTab, setActiveTab] = useState<MobileTab>('chat');
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
      {/* Action bar — 5 icon buttons left, submit right */}
      <div className="flex items-center justify-between px-1 pt-1 pb-2">
        <div className="flex items-center">
          {/* Reforge */}
          <button type="button" className="flex size-10 items-center justify-center rounded-lg text-muted-foreground/70 transition-colors hover:bg-accent hover:text-muted-foreground active:scale-95">
            <Flame className="size-5 text-primary/70" />
          </button>
          {/* Mode toggle */}
          <button
            type="button"
            onClick={() => setAgentMode((m) => (m === 'plan' ? 'agent' : 'plan'))}
            className={cn(
              'flex size-10 items-center justify-center rounded-lg transition-colors active:scale-95',
              agentMode === 'plan'
                ? 'text-primary bg-primary/10'
                : 'text-muted-foreground/70 hover:bg-accent hover:text-muted-foreground',
            )}
          >
            {agentMode === 'plan' ? <Eye className="size-5" /> : <Zap className="size-5" />}
          </button>
          {/* Attach */}
          <button type="button" className="flex size-10 items-center justify-center rounded-lg text-muted-foreground/70 transition-colors hover:bg-accent hover:text-muted-foreground active:scale-95">
            <Paperclip className="size-5" />
          </button>
          {/* Session Remote */}
          <button
            type="button"
            onClick={() => setSessionOpen((v) => !v)}
            className={cn(
              'flex size-10 items-center justify-center rounded-lg transition-colors active:scale-95',
              sessionOpen
                ? 'text-purple-400 bg-purple-500/10'
                : 'text-muted-foreground/70 hover:bg-accent hover:text-muted-foreground',
            )}
          >
            <Bookmark className="size-5" />
          </button>
          {/* More */}
          <button type="button" className="flex size-10 items-center justify-center rounded-lg text-muted-foreground/70 transition-colors hover:bg-accent hover:text-muted-foreground active:scale-95">
            <MoreHorizontal className="size-5" />
          </button>
        </div>
        <div className="pr-2">
          <PromptInputSubmit />
        </div>
      </div>
    </PromptInput>
  );

  // Top pills row — model selector + autonomy selector + token counter
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
          <div className="flex w-full flex-wrap items-center justify-start gap-2">
            {/* Model selector dropdown */}
            <div ref={agentRef} className="relative">
              <button
                type="button"
                onClick={() => setAgentOpen((v) => !v)}
                className={cn(
                  'flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-medium transition-colors',
                  agentOpen
                    ? 'bg-primary/15 text-primary'
                    : 'bg-muted/50 text-muted-foreground/60 hover:bg-muted hover:text-muted-foreground',
                )}
              >
                <Zap className="h-3 w-3" />
                <span>{AGENT_OPTIONS.find((a) => a.id === selectedAgent)?.label ?? 'Agent'}</span>
                <ChevronDown className={cn('h-3 w-3 transition-transform duration-150', agentOpen && 'rotate-180')} />
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
                            onClick={() => { setSelectedAgent(agent.id); setAgentOpen(false); }}
                            className={cn(
                              'flex w-full items-start gap-2 rounded-lg px-2.5 py-2 text-left transition-colors',
                              selectedAgent === agent.id
                                ? 'bg-primary/10 text-primary'
                                : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground',
                            )}
                          >
                            <div className="flex flex-col min-w-0">
                              <span className="text-[11px] font-medium">{agent.label}</span>
                              <span className="text-[10px] text-muted-foreground">{agent.description}</span>
                            </div>
                            {selectedAgent === agent.id && (
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

            {/* Autonomy selector popup */}
            <AutonomySelectorPopup selected={autonomy} onSelect={setAutonomy} />

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
      className="relative flex w-full flex-col overflow-hidden bg-background"
      style={{ height: vpHeight }}
    >
      {/* Grid background — 1:1 square cells */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#4f4f4f2e_1px,transparent_1px),linear-gradient(to_bottom,#4f4f4f2e_1px,transparent_1px)] bg-[size:24px_24px] [mask-image:radial-gradient(ellipse_80%_50%_at_50%_0%,#000_70%,transparent_110%)]" />

      {/* Layout: side-by-side chat preview + prompt column.
          vpHeight shrinks when iOS keyboard opens — flex-1 min-h-0 on heading area
          keeps heading visible while prompt stays pinned at bottom. */}
      <div className="relative flex flex-1 min-h-0 gap-0 overflow-hidden">
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

        {/* Prompt column — heading centers in available space, input pinned at bottom.
            Same pattern as ChatPanel welcome state: flex-1 min-h-0 for heading area
            so iOS keyboard open (shrinking vpHeight) never clips heading off-screen. */}
        <div className={cn(
          'flex h-full flex-col items-center px-3 pb-4 md:px-5 md:pb-5 md:justify-center mx-auto w-full',
          'transition-[max-width] duration-300 ease-in-out',
          previewOpen ? 'md:max-w-md' : 'md:max-w-2xl',
        )}>
            {/* Heading + SessionIsland:
                mobile — flex-1 min-h-0 so content centers in space above pinned prompt
                desktop — md:flex-none so parent justify-center groups everything together */}
            <div className="flex flex-1 min-h-0 md:flex-none flex-col items-center justify-center overflow-hidden w-full gap-4 py-4">
              <AnimatePresence>
                {!previewOpen && (
                  <motion.div
                    key="show-preview"
                    initial={{ opacity: 0, y: -6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    transition={{ duration: 0.15 }}
                    className="self-start"
                  >
                    <button
                      type="button"
                      onClick={() => setPreviewOpen(true)}
                      className="flex items-center gap-1 rounded-full bg-muted/50 px-2.5 py-1 text-[10px] font-medium text-muted-foreground/60 transition-colors hover:bg-muted hover:text-muted-foreground"
                    >
                      <PanelLeftOpen className="h-3 w-3" />
                      <span>Show preview</span>
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>

              {headline}

              <SessionIsland
                status={status}
                controlsOpen={sessionOpen}
                onNew={handleNew}
                onPause={handlePause}
                onResume={handleResume}
                onStop={handleStop}
              />
            </div>

            {/* Suggestions + prompt pinned at bottom.
                Mobile: suggestions above prompt. Desktop: prompt above suggestions. */}
            <div className="w-full flex flex-col gap-2">
              <div className="order-1 md:order-2">{suggestions}</div>
              <div className="order-2 md:order-1">{promptInput}</div>
            </div>
        </div>
      </div>

      {/* HIG Tab bar — same as real MobileLayout */}
      <MobileTabBar
        activeTab={activeTab}
        onTabChange={setActiveTab}
        hasSession
        keyboardOpen={keyboardOpen}
      />
    </div>
  );
}

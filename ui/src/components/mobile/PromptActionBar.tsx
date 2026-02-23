import { useRef } from 'react';
import { Flame, Eye, Zap, Paperclip, MoreHorizontal } from 'lucide-react';
import { useReforge } from '@/hooks/useReforge';
import { useSandboxStore } from '@/hooks/useSandbox';
import { usePromptInput } from '@/components/prompt-input/context';
import { PromptInputSubmit } from '@/components/prompt-input';
import { SessionRemote } from '@/components/SessionRemote';
import { haptics } from '@/lib/haptics';
import { cn } from '@/lib/cn';

type PromptActionBarProps = {
  onMoreOpen: () => void;
};

export function PromptActionBar({ onMoreOpen }: PromptActionBarProps) {
  const { addImage, setInput } = usePromptInput();
  const sdkMode = useSandboxStore((s) => s.sdkMode);
  const setMode = useSandboxStore((s) => s.setMode);
  const sessionId = useSandboxStore((s) => s.currentSession?.id);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    for (const file of Array.from(e.target.files ?? [])) {
      addImage(file);
    }
    e.target.value = '';
  };

  return (
    <div className="flex items-center justify-between px-1 pt-1 pb-2">
      {/* Hidden file input for attach */}
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={handleFileChange}
      />

      <div className="flex items-center">
        {/* Reforge */}
        <button
          type="button"
          onClick={() => { haptics.light(); useReforge.getState().open(); }}
          className="flex size-10 items-center justify-center rounded-lg text-muted-foreground/70 transition-colors hover:bg-accent hover:text-muted-foreground active:scale-95"
        >
          <Flame className="size-5 text-primary/70" />
        </button>

        {/* Mode toggle */}
        <button
          type="button"
          onClick={() => { haptics.light(); setMode(sdkMode === 'plan' ? 'agent' : 'plan'); }}
          className={cn(
            'flex size-10 items-center justify-center rounded-lg transition-colors active:scale-95',
            sdkMode === 'plan'
              ? 'text-primary bg-primary/10'
              : 'text-muted-foreground/70 hover:bg-accent hover:text-muted-foreground',
          )}
        >
          {sdkMode === 'plan' ? <Eye className="size-5" /> : <Zap className="size-5" />}
        </button>

        {/* Attach */}
        <button
          type="button"
          onClick={() => { haptics.light(); fileRef.current?.click(); }}
          className="flex size-10 items-center justify-center rounded-lg text-muted-foreground/70 transition-colors hover:bg-accent hover:text-muted-foreground active:scale-95"
        >
          <Paperclip className="size-5" />
        </button>

        {/* Session Remote — icon-only variant */}
        <SessionRemote
          sessionId={sessionId}
          onSetPrompt={(text) => setInput(text)}
          iconOnly
        />

        {/* More */}
        <button
          type="button"
          onClick={() => { haptics.light(); onMoreOpen(); }}
          className="flex size-10 items-center justify-center rounded-lg text-muted-foreground/70 transition-colors hover:bg-accent hover:text-muted-foreground active:scale-95"
        >
          <MoreHorizontal className="size-5" />
        </button>
      </div>

      <div className="pr-2">
        <PromptInputSubmit />
      </div>
    </div>
  );
}

import { useRef } from 'react';
import { Flame, Eye, Zap, Paperclip, MoreHorizontal } from 'lucide-react';
import { useReforge } from '@/hooks/useReforge';
import { useSandboxStore } from '@/hooks/useSandbox';
import { usePromptInput } from '@/components/prompt-input/context';
import { ReforgeModal } from '@/components/chat/ReforgeModal';
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

  const handleReforge = () => {
    haptics.light();
    useReforge.getState().open();
  };

  const handleModeToggle = () => {
    haptics.light();
    setMode(sdkMode === 'plan' ? 'agent' : 'plan');
  };

  const handleAttach = () => {
    haptics.light();
    fileRef.current?.click();
  };

  const handleMore = () => {
    haptics.light();
    onMoreOpen();
  };

  const btnBase = 'flex items-center justify-center rounded-lg transition-colors active:scale-95';
  const btnSize = 'h-10 w-10';
  const btnColor = 'text-muted-foreground/70 hover:bg-accent hover:text-muted-foreground active:bg-accent';

  return (
    <div className="flex items-center justify-between px-1 pt-1 pb-0.5">
      {/* Hidden file input for attach */}
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={handleFileChange}
      />

      {/* ReforgeModal lives here so it's rendered when PromptInputReforge is hidden */}
      <ReforgeModal
        onInsert={(text) => setInput((prev: string) => (prev ? `${prev}\n\n${text}` : text))}
      />

      {/* Reforge */}
      <button
        type="button"
        onClick={handleReforge}
        title="Reforge prompt"
        className={cn(btnBase, btnSize, btnColor)}
      >
        <Flame className="size-5 text-primary/70" />
      </button>

      {/* Mode toggle */}
      <button
        type="button"
        onClick={handleModeToggle}
        title={sdkMode === 'plan' ? 'Switch to Agent mode' : 'Switch to Plan mode'}
        className={cn(btnBase, btnSize, sdkMode === 'plan' ? 'text-primary bg-primary/10' : btnColor)}
      >
        {sdkMode === 'plan' ? (
          <Eye className="size-5" />
        ) : (
          <Zap className="size-5" />
        )}
      </button>

      {/* Attach */}
      <button
        type="button"
        onClick={handleAttach}
        title="Attach image"
        className={cn(btnBase, btnSize, btnColor)}
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
        onClick={handleMore}
        title="More"
        className={cn(btnBase, btnSize, btnColor)}
      >
        <MoreHorizontal className="size-5" />
      </button>
    </div>
  );
}

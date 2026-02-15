import { Flame } from 'lucide-react';
import { useReforge } from '@/hooks/useReforge';
import { ReforgeModal } from '@/components/chat/ReforgeModal';
import { usePromptInput } from './context';

export function PromptInputReforge() {
  const { setInput } = usePromptInput();

  return (
    <>
      <button
        type="button"
        onClick={() => useReforge.getState().open()}
        className="flex items-center gap-1 rounded-full bg-primary/10 px-3 py-1 text-[10px] font-medium text-primary hover:bg-primary/20 transition-colors"
      >
        <Flame className="h-3 w-3" />
        Reforge
      </button>
      <ReforgeModal
        onInsert={(text) =>
          setInput((prev: string) => (prev ? `${prev}\n\n${text}` : text))
        }
      />
    </>
  );
}

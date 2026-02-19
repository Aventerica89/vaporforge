import { useState, useRef, useCallback } from 'react';
import { Send, Check, ChevronRight } from 'lucide-react';

interface AgencyInlineAIProps {
  siteId: string | null;
  activePane: 'astro' | 'css';
  cssContext: string;
  astroContext: string;
  elementContext: string;
  onInsert: (pane: 'astro' | 'css', text: string) => void;
}

export function AgencyInlineAI({
  siteId,
  activePane,
  cssContext,
  astroContext,
  elementContext,
  onInsert,
}: AgencyInlineAIProps) {
  const [prompt, setPrompt] = useState('');
  const [generatedText, setGeneratedText] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [applied, setApplied] = useState(false);
  const targetPaneRef = useRef<'astro' | 'css'>(activePane);

  const handleGenerate = useCallback(async () => {
    if (!prompt.trim() || !siteId || isGenerating) return;
    setIsGenerating(true);
    setGeneratedText('');
    setError(null);
    setApplied(false);
    targetPaneRef.current = activePane;

    try {
      const token = localStorage.getItem('session_token');
      const res = await fetch(`/api/agency/sites/${siteId}/inline-ai`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          prompt,
          cssContext,
          astroContext,
          targetPane: activePane,
          elementContext,
        }),
      });

      if (!res.ok) {
        const json = await res.json().catch(() => null);
        throw new Error((json as { error?: string })?.error ?? `Request failed (${res.status})`);
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error('No response stream');

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const msg = JSON.parse(line.slice(6)) as { type: string; text?: string; error?: string };
            if (msg.type === 'text' && msg.text) {
              setGeneratedText((prev) => prev + msg.text);
            } else if (msg.type === 'error') {
              setError(msg.error ?? 'Generation failed');
            }
          } catch {
            // ignore malformed SSE lines
          }
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Generation failed');
    } finally {
      setIsGenerating(false);
    }
  }, [prompt, siteId, activePane, cssContext, astroContext, elementContext, isGenerating]);

  const handleApply = useCallback(() => {
    if (!generatedText) return;
    onInsert(targetPaneRef.current, generatedText);
    setApplied(true);
  }, [generatedText, onInsert]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleGenerate();
    }
  };

  return (
    <div className="flex h-full flex-col border-l border-zinc-700 bg-zinc-900">
      {/* Header */}
      <div className="flex h-9 shrink-0 items-center justify-between border-b border-zinc-700 px-3">
        <span className="text-[11px] font-medium text-zinc-400">Inline AI</span>
        <span
          className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
            activePane === 'css'
              ? 'bg-blue-900/50 text-blue-400'
              : 'bg-violet-900/50 text-violet-400'
          }`}
        >
          {activePane === 'css' ? 'CSS' : 'Astro'}
        </span>
      </div>

      {/* Generated output */}
      <div className="flex-1 overflow-auto p-3">
        {error ? (
          <div className="rounded-md bg-red-900/30 p-2 text-[11px] text-red-400">{error}</div>
        ) : generatedText ? (
          <pre className="whitespace-pre-wrap font-mono text-[11px] leading-relaxed text-zinc-300">
            {generatedText}
          </pre>
        ) : (
          <div className="flex h-full items-center justify-center text-[11px] text-zinc-600">
            {isGenerating ? (
              <span className="animate-pulse">Generating...</span>
            ) : activePane === 'css' ? (
              'Describe the CSS you want — shadows, hover states, animations...'
            ) : (
              'Describe the HTML/Astro markup you want...'
            )}
          </div>
        )}
      </div>

      {/* Apply button */}
      {generatedText && !isGenerating && (
        <div className="border-t border-zinc-700 px-3 py-2">
          <button
            onClick={handleApply}
            className={`flex w-full items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-[12px] font-medium transition-colors ${
              applied
                ? 'bg-emerald-800 text-emerald-200'
                : 'bg-violet-600 text-white hover:bg-violet-500'
            }`}
          >
            {applied ? (
              <>
                <Check className="h-3.5 w-3.5" />
                Applied
              </>
            ) : (
              <>
                <ChevronRight className="h-3.5 w-3.5" />
                Apply to {targetPaneRef.current === 'css' ? 'CSS' : 'Astro'}
              </>
            )}
          </button>
        </div>
      )}

      {/* Prompt input */}
      <div className="border-t border-zinc-700 p-2">
        <div className="flex items-end gap-1.5 rounded-md border border-zinc-600 bg-zinc-800 px-2 py-1.5 focus-within:border-violet-500">
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              activePane === 'css'
                ? 'Add box shadow, hover effect...'
                : 'Add a new section, button...'
            }
            rows={2}
            className="flex-1 resize-none bg-transparent text-[12px] text-zinc-200 placeholder-zinc-600 outline-none"
          />
          <button
            onClick={handleGenerate}
            disabled={!prompt.trim() || isGenerating || !siteId}
            className="shrink-0 rounded p-1 text-violet-400 hover:text-violet-300 disabled:opacity-40"
            title="Generate (Cmd+Enter)"
          >
            <Send className="h-3.5 w-3.5" />
          </button>
        </div>
        <p className="mt-1 text-[10px] text-zinc-600">Cmd+Enter to generate</p>
      </div>
    </div>
  );
}

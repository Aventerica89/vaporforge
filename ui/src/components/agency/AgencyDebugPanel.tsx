import { useState, useRef, useCallback } from 'react';
import { X, Upload, Loader2 } from 'lucide-react';

interface ComponentInfo {
  component: string;
  file: string;
  elementTag?: string;
  elementHTML?: string;
}

interface AgencyDebugPanelProps {
  siteId: string | null;
  selectedComponent: ComponentInfo | null;
  onClose: () => void;
}

export function AgencyDebugPanel({
  siteId,
  selectedComponent,
  onClose,
}: AgencyDebugPanelProps) {
  const [image, setImage] = useState<{ base64: string; mimeType: string } | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [analysisText, setAnalysisText] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadImageFile = useCallback((file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string;
      const [header, base64] = dataUrl.split(',');
      const mimeType = header.match(/data:([^;]+)/)?.[1] ?? 'image/png';
      setImage({ base64, mimeType });
      setImagePreview(dataUrl);
      setAnalysisText('');
      setError(null);
    };
    reader.readAsDataURL(file);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const file = e.dataTransfer.files[0];
      if (file?.type.startsWith('image/')) loadImageFile(file);
    },
    [loadImageFile],
  );

  const handlePaste = useCallback(
    (e: React.ClipboardEvent) => {
      const item = Array.from(e.clipboardData.items).find(
        (it) => it.type.startsWith('image/'),
      );
      if (item) {
        const file = item.getAsFile();
        if (file) loadImageFile(file);
      }
    },
    [loadImageFile],
  );

  const buildContext = () => {
    const parts: string[] = ['Analyze this screenshot for CSS/styling issues.'];
    if (selectedComponent) {
      parts.push('', `Selected component: ${selectedComponent.component}`);
      parts.push(`File: ${selectedComponent.file}`);
      if (selectedComponent.elementTag) {
        parts.push(`Element: <${selectedComponent.elementTag}>`);
      }
      if (selectedComponent.elementHTML) {
        parts.push('', 'Element HTML:', selectedComponent.elementHTML.slice(0, 500));
      }
    }
    parts.push(
      '',
      'Look for:',
      '- CSS specificity conflicts (explicit .class rule overriding a Tailwind utility)',
      '- Inline styles or CSS custom properties overriding expected values',
      '- Inherited colors from parent elements',
      '- Suggest the minimal fix (use Tailwind ! prefix or edit the CSS class directly)',
    );
    return parts.join('\n');
  };

  const handleAnalyze = async () => {
    if (!image || !siteId) return;
    setIsAnalyzing(true);
    setAnalysisText('');
    setError(null);

    try {
      const token = localStorage.getItem('session_token');
      const res = await fetch(`/api/agency/sites/${siteId}/debug`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          image: image.base64,
          mediaType: image.mimeType,
          context: buildContext(),
        }),
      });

      if (!res.ok) {
        const json = await res.json().catch(() => null);
        throw new Error(json?.error ?? `Analysis failed (${res.status})`);
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
            const msg = JSON.parse(line.slice(6));
            if (msg.type === 'text' && msg.text) {
              setAnalysisText((prev) => prev + msg.text);
            } else if (msg.type === 'error') {
              setError(msg.error);
            }
          } catch {}
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Analysis failed');
    } finally {
      setIsAnalyzing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/50">
      <div className="flex w-full max-w-3xl flex-col rounded-t-xl border border-zinc-700 bg-zinc-900 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-700 px-4 py-2">
          <span className="text-sm font-medium text-zinc-200">Debug Analysis</span>
          <button
            onClick={onClose}
            className="rounded p-1 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex gap-3 p-4" style={{ maxHeight: '70vh', overflow: 'hidden' }}>
          {/* Left: image drop zone */}
          <div className="flex w-64 shrink-0 flex-col gap-2">
            <div
              className={`relative flex h-48 cursor-pointer items-center justify-center rounded-lg border-2 border-dashed transition-colors ${
                image
                  ? 'border-zinc-600 bg-zinc-800'
                  : 'border-zinc-700 bg-zinc-850 hover:border-zinc-500'
              }`}
              onDrop={handleDrop}
              onDragOver={(e) => e.preventDefault()}
              onPaste={handlePaste}
              tabIndex={0}
              onKeyDown={(e) => e.key === 'Enter' && fileInputRef.current?.click()}
              onClick={() => !image && fileInputRef.current?.click()}
            >
              {imagePreview ? (
                <img
                  src={imagePreview}
                  alt="Screenshot"
                  className="h-full w-full rounded-md object-contain"
                />
              ) : (
                <div className="flex flex-col items-center gap-2 text-zinc-500">
                  <Upload className="h-6 w-6" />
                  <span className="text-center text-[11px]">
                    Paste, drop, or click to upload a screenshot
                  </span>
                </div>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) loadImageFile(file);
                }}
              />
            </div>

            {selectedComponent && (
              <div className="rounded-md border border-zinc-700 bg-zinc-800/50 px-3 py-2">
                <div className="text-[10px] font-medium text-zinc-500 uppercase tracking-wide">
                  Context
                </div>
                <div className="mt-1 text-[11px] text-zinc-300 truncate">
                  {selectedComponent.component}
                </div>
                <div className="text-[10px] text-zinc-500 truncate">
                  {selectedComponent.file}
                </div>
              </div>
            )}

            <button
              onClick={handleAnalyze}
              disabled={!image || isAnalyzing}
              className="flex items-center justify-center gap-1.5 rounded-md bg-violet-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-violet-500 disabled:opacity-40"
            >
              {isAnalyzing ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Analyzing...
                </>
              ) : (
                'Analyze'
              )}
            </button>
          </div>

          {/* Right: analysis output */}
          <div className="flex flex-1 flex-col overflow-hidden">
            {error ? (
              <div className="rounded-md bg-red-900/30 p-3 text-sm text-red-400">
                {error}
              </div>
            ) : analysisText ? (
              <div className="flex-1 overflow-auto rounded-md bg-zinc-800 p-3">
                <pre className="whitespace-pre-wrap font-mono text-[12px] leading-relaxed text-zinc-200">
                  {analysisText}
                </pre>
              </div>
            ) : (
              <div className="flex h-full items-center justify-center text-[12px] text-zinc-600">
                Upload a screenshot and click Analyze to diagnose styling issues
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

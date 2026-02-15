import { useState, useRef, useCallback, useEffect } from 'react';
import { Mic } from 'lucide-react';
import { usePromptInput } from './context';
import { cn } from '@/lib/cn';

// Feature detect Web Speech API (non-standard, not in all browsers)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const SpeechRecognitionApi: any =
  typeof window !== 'undefined'
    ? (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition
    : null;

export function PromptInputSpeech() {
  const { setInput } = usePromptInput();
  const [isListening, setIsListening] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      recognitionRef.current?.abort();
    };
  }, []);

  const toggle = useCallback(() => {
    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
      return;
    }

    if (!SpeechRecognitionApi) return;

    const recognition = new SpeechRecognitionApi();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = 'en-US';

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    recognition.onresult = (event: any) => {
      const transcript = event.results?.[0]?.[0]?.transcript;
      if (transcript) {
        setInput((prev: string) => (prev ? `${prev} ${transcript}` : transcript));
      }
    };

    recognition.onend = () => {
      setIsListening(false);
      recognitionRef.current = null;
    };

    recognition.onerror = () => {
      setIsListening(false);
      recognitionRef.current = null;
    };

    recognitionRef.current = recognition;
    recognition.start();
    setIsListening(true);
  }, [isListening, setInput]);

  // Progressive enhancement: hide if Web Speech unavailable
  if (!SpeechRecognitionApi) return null;

  return (
    <button
      type="button"
      onClick={toggle}
      className={cn(
        'relative flex h-8 w-8 items-center justify-center rounded-lg transition-colors',
        isListening
          ? 'text-red-400 bg-red-500/10'
          : 'text-muted-foreground/60 hover:bg-muted hover:text-muted-foreground',
      )}
      title={isListening ? 'Stop listening' : 'Voice input'}
    >
      <Mic className="h-4 w-4" />
      {isListening && (
        <span className="absolute inset-0 animate-ping rounded-lg border border-red-400/40" />
      )}
    </button>
  );
}

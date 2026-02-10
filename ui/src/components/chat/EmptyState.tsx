import { Bot, Code, Bug, TestTube, Lightbulb } from 'lucide-react';

interface EmptyStateProps {
  onSuggestion: (text: string) => void;
}

const SUGGESTIONS = [
  { icon: Code, text: 'Explain this code', color: 'text-primary' },
  { icon: Bug, text: 'Help me fix this bug', color: 'text-secondary' },
  { icon: TestTube, text: 'Write tests for this file', color: 'text-primary/80' },
  { icon: Lightbulb, text: 'Suggest improvements', color: 'text-secondary/80' },
];

export function EmptyState({ onSuggestion }: EmptyStateProps) {
  return (
    <div className="flex h-full flex-col items-center justify-center text-center">
      <div className="relative mb-4">
        <Bot className="h-14 w-14 text-primary/30" />
        <div className="absolute -bottom-1 -right-1 h-4 w-4 rounded-full bg-primary/30 shadow-[0_0_8px_hsl(var(--primary)/0.4)] animate-pulse" />
      </div>
      <p className="mb-1 text-sm font-semibold text-transparent bg-clip-text bg-gradient-to-r from-primary to-secondary">
        How can I help?
      </p>
      <p className="mb-5 text-xs text-muted-foreground">
        Ask Claude anything about your code
      </p>
      <div className="flex flex-wrap justify-center gap-2">
        {SUGGESTIONS.map(({ icon: Icon, text, color }) => (
          <button
            key={text}
            onClick={() => onSuggestion(text)}
            className="flex items-center gap-1.5 rounded-full border border-border bg-background/50 px-3 py-1.5 text-xs text-muted-foreground transition-all hover:border-primary/50 hover:text-foreground hover:shadow-[0_0_8px_-3px_hsl(var(--primary)/0.2)]"
          >
            <Icon className={`h-3 w-3 ${color}`} />
            {text}
          </button>
        ))}
      </div>
    </div>
  );
}

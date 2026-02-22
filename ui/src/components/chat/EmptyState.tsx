import { Bot, Code, Bug, TestTube, Lightbulb } from 'lucide-react';
import { Suggestions, Suggestion } from '../ai-elements/Suggestion';

interface EmptyStateProps {
  onSuggestion: (text: string) => void;
}

const SUGGESTIONS = [
  { icon: Code, text: 'Explain this code' },
  { icon: Bug, text: 'Help me fix this bug' },
  { icon: TestTube, text: 'Write tests for this file' },
  { icon: Lightbulb, text: 'Suggest improvements' },
] as const;

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
      <Suggestions className="justify-center">
        {SUGGESTIONS.map(({ icon: Icon, text }) => (
          <Suggestion
            key={text}
            suggestion={text}
            onClick={onSuggestion}
          >
            <Icon className="mr-1 h-3 w-3" />
            {text}
          </Suggestion>
        ))}
      </Suggestions>
    </div>
  );
}

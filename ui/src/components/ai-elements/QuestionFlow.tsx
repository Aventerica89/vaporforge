import { useState, useCallback } from 'react';
import { HelpCircle, Check, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/cn';

interface Question {
  id: string;
  question: string;
  type: 'text' | 'select' | 'multiselect' | 'confirm';
  options?: string[];
  placeholder?: string;
  required?: boolean;
}

interface QuestionFlowProps {
  title?: string;
  questions: Question[];
  onSubmit: (formattedAnswers: string) => void;
  onSkip?: () => void;
}

type Answers = Record<string, string | string[] | boolean>;

function formatAnswers(questions: Question[], answers: Answers): string {
  const lines = questions.map((q) => {
    const raw = answers[q.id];
    let value: string;
    if (Array.isArray(raw)) {
      value = raw.length > 0 ? raw.join(', ') : '(none selected)';
    } else if (typeof raw === 'boolean') {
      value = raw ? 'Yes' : 'No';
    } else {
      value = typeof raw === 'string' && raw.trim() ? raw.trim() : '(skipped)';
    }
    return `- ${q.question}: ${value}`;
  });
  return `Here are my answers:\n\n${lines.join('\n')}`;
}

function ConfirmToggle({
  value,
  onChange,
}: {
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex gap-2">
      {(['Yes', 'No'] as const).map((opt) => {
        const isYes = opt === 'Yes';
        const active = isYes ? value === true : value === false;
        return (
          <button
            key={opt}
            type="button"
            onClick={() => onChange(isYes)}
            className={cn(
              'rounded-md border px-3 py-1 text-xs font-medium transition-colors',
              active
                ? 'border-primary/60 bg-primary/15 text-primary'
                : 'border-border/50 bg-transparent text-muted-foreground hover:border-primary/30 hover:text-foreground',
            )}
          >
            {opt}
          </button>
        );
      })}
    </div>
  );
}

export function QuestionFlow({ title, questions, onSubmit, onSkip }: QuestionFlowProps) {
  const [answers, setAnswers] = useState<Answers>(() => {
    const init: Answers = {};
    for (const q of questions) {
      if (q.type === 'confirm') init[q.id] = false;
      else if (q.type === 'multiselect') init[q.id] = [];
      else init[q.id] = '';
    }
    return init;
  });
  const [submitted, setSubmitted] = useState(false);

  const setAnswer = useCallback((id: string, value: string | string[] | boolean) => {
    setAnswers((prev) => ({ ...prev, [id]: value }));
  }, []);

  const toggleMulti = useCallback((id: string, option: string) => {
    setAnswers((prev) => {
      const current = (prev[id] as string[]) || [];
      const next = current.includes(option)
        ? current.filter((o) => o !== option)
        : [...current, option];
      return { ...prev, [id]: next };
    });
  }, []);

  const canSubmit = questions.every((q) => {
    if (!q.required && q.required !== undefined) return true;
    const val = answers[q.id];
    if (q.type === 'multiselect') return Array.isArray(val) && val.length > 0;
    if (q.type === 'text') return typeof val === 'string' && val.trim().length > 0;
    return true; // confirm and select always have a value
  });

  const handleSubmit = useCallback(() => {
    if (!canSubmit) return;
    setSubmitted(true);
    onSubmit(formatAnswers(questions, answers));
  }, [canSubmit, onSubmit, questions, answers]);

  if (submitted) {
    return (
      <div className="my-1.5 flex items-center gap-2 rounded-lg border border-green-500/30 bg-green-500/5 px-3 py-2 text-xs text-green-400">
        <Check className="h-3.5 w-3.5 flex-shrink-0" />
        <span className="font-medium">Answers submitted</span>
      </div>
    );
  }

  return (
    <div className="my-1.5 rounded-lg border border-primary/30 bg-primary/5 px-3 py-3">
      {/* Header */}
      <div className="mb-3 flex items-center gap-2">
        <HelpCircle className="h-3.5 w-3.5 flex-shrink-0 text-primary" />
        <span className="text-xs font-medium text-primary">
          {title || 'A few questions before I proceed'}
        </span>
      </div>

      {/* Questions */}
      <div className="space-y-3">
        {questions.map((q) => (
          <div key={q.id} className="space-y-1.5">
            <label className="block text-xs font-medium text-foreground/90">
              {q.question}
              {q.required !== false && <span className="ml-0.5 text-primary">*</span>}
            </label>

            {q.type === 'text' && (
              <input
                type="text"
                value={(answers[q.id] as string) || ''}
                placeholder={q.placeholder || ''}
                onChange={(e) => setAnswer(q.id, e.target.value)}
                className="w-full rounded-md border border-border/50 bg-background/50 px-2.5 py-1.5 text-xs text-foreground outline-none placeholder:text-muted-foreground/50 focus:border-primary/50 focus:ring-0 transition-colors"
              />
            )}

            {q.type === 'confirm' && (
              <ConfirmToggle
                value={(answers[q.id] as boolean) ?? false}
                onChange={(v) => setAnswer(q.id, v)}
              />
            )}

            {q.type === 'select' && q.options && (
              <div className="flex flex-wrap gap-1.5">
                {q.options.map((opt) => {
                  const active = answers[q.id] === opt;
                  return (
                    <button
                      key={opt}
                      type="button"
                      onClick={() => setAnswer(q.id, opt)}
                      className={cn(
                        'rounded-md border px-2.5 py-1 text-xs transition-colors',
                        active
                          ? 'border-primary/60 bg-primary/15 text-primary'
                          : 'border-border/50 bg-transparent text-muted-foreground hover:border-primary/30 hover:text-foreground',
                      )}
                    >
                      {opt}
                    </button>
                  );
                })}
              </div>
            )}

            {q.type === 'multiselect' && q.options && (
              <div className="flex flex-wrap gap-1.5">
                {q.options.map((opt) => {
                  const selected = ((answers[q.id] as string[]) || []).includes(opt);
                  return (
                    <button
                      key={opt}
                      type="button"
                      onClick={() => toggleMulti(q.id, opt)}
                      className={cn(
                        'rounded-md border px-2.5 py-1 text-xs transition-colors',
                        selected
                          ? 'border-primary/60 bg-primary/15 text-primary'
                          : 'border-border/50 bg-transparent text-muted-foreground hover:border-primary/30 hover:text-foreground',
                      )}
                    >
                      {selected && <Check className="mr-1 inline-block h-2.5 w-2.5" />}
                      {opt}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Actions */}
      <div className="mt-3 flex items-center gap-2">
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!canSubmit}
          className={cn(
            'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[11px] font-medium transition-colors',
            canSubmit
              ? 'bg-primary/20 text-primary hover:bg-primary/30'
              : 'cursor-not-allowed bg-muted text-muted-foreground/50',
          )}
        >
          Submit
          <ChevronRight className="h-3 w-3" />
        </button>
        {onSkip && (
          <button
            type="button"
            onClick={onSkip}
            className="text-[11px] text-muted-foreground/60 hover:text-muted-foreground transition-colors"
          >
            Skip
          </button>
        )}
      </div>
    </div>
  );
}

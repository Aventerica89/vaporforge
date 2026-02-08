import { useState, useEffect, useCallback } from 'react';
import { FileCode, Check, Save, Loader2 } from 'lucide-react';
import { userApi } from '@/lib/api';

const CLAUDE_MD_PLACEHOLDER = `# My Global Instructions

## Coding Style
- Use TypeScript strict mode
- Prefer functional patterns
- Write tests for new features

## Project Conventions
- Conventional commits (feat:, fix:, etc.)
- Max 400 lines per file

## Rules
- Never commit .env files
- Always validate user input`;

export function ClaudeMdTab() {
  const [content, setContent] = useState('');
  const [savedContent, setSavedContent] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saved' | 'error'>('idle');

  const isDirty = content !== savedContent;

  const loadContent = useCallback(async () => {
    setIsLoading(true);
    try {
      const result = await userApi.getClaudeMd();
      if (result.success && result.data) {
        setContent(result.data.content);
        setSavedContent(result.data.content);
      }
    } catch {
      // Failed to load — start with empty
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadContent();
  }, [loadContent]);

  const handleSave = async () => {
    setIsSaving(true);
    setSaveStatus('idle');
    try {
      const result = await userApi.saveClaudeMd(content);
      if (result.success) {
        setSavedContent(content);
        setSaveStatus('saved');
        setTimeout(() => setSaveStatus('idle'), 2000);
      } else {
        setSaveStatus('error');
      }
    } catch {
      setSaveStatus('error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 's') {
      e.preventDefault();
      if (isDirty && !isSaving) {
        handleSave();
      }
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-5 w-5 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col gap-3">
      <section className="space-y-1.5">
        <h3 className="flex items-center gap-2 font-display text-sm font-bold uppercase tracking-wider text-foreground">
          <FileCode className="h-4 w-4 text-primary" />
          Global CLAUDE.md
        </h3>
        <p className="text-xs text-muted-foreground leading-relaxed">
          Instructions injected into every new sandbox session at{' '}
          <code className="text-primary">~/.claude/CLAUDE.md</code>.
          Claude will follow these across all your workspaces.
        </p>
      </section>

      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={CLAUDE_MD_PLACEHOLDER}
        className="flex-1 min-h-[240px] w-full resize-none rounded-lg border border-border bg-muted p-3 font-mono text-xs text-foreground placeholder:text-muted-foreground/50 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
        spellCheck={false}
      />

      <div className="flex items-center justify-between">
        <span className="text-[10px] tabular-nums text-muted-foreground/60">
          {content.length.toLocaleString()} chars
          {isDirty && ' (unsaved)'}
        </span>

        <div className="flex items-center gap-2">
          {saveStatus === 'saved' && (
            <span className="flex items-center gap-1 text-xs text-success">
              <Check className="h-3 w-3" />
              Saved
            </span>
          )}
          {saveStatus === 'error' && (
            <span className="text-xs text-error">Save failed</span>
          )}
          <button
            onClick={handleSave}
            disabled={!isDirty || isSaving}
            className="btn-primary flex items-center gap-1.5 px-3 py-1.5 text-xs disabled:opacity-50"
          >
            {isSaving ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Save className="h-3 w-3" />
            )}
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

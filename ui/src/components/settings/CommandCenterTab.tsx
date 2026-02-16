import { useState, useEffect, useCallback } from 'react';
import {
  Loader2,
  Save,
  RotateCcw,
  Terminal,
  Shield,
  Info,
  ChevronDown,
  ChevronRight,
  Zap,
  GitBranch,
  CheckSquare,
  BarChart3,
  FileText,
} from 'lucide-react';
import { vfRulesApi, autoContextApi } from '@/lib/api';

const SYSTEM_PROMPT =
  'You are working in a cloud sandbox. Always create, edit, and manage files in /workspace (your cwd). Never use /tmp unless explicitly asked.';

export function CommandCenterTab() {
  const [rules, setRules] = useState('');
  const [isDefault, setIsDefault] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [saveResult, setSaveResult] = useState<string | null>(null);
  const [showPrompt, setShowPrompt] = useState(false);
  const [autoContextEnabled, setAutoContextEnabled] = useState(true);
  const [autoContextLoading, setAutoContextLoading] = useState(true);

  const loadAutoContext = useCallback(async () => {
    setAutoContextLoading(true);
    try {
      const result = await autoContextApi.get();
      if (result.success && result.data) {
        setAutoContextEnabled(result.data.enabled);
      }
    } catch {
      // Default to enabled on error
    } finally {
      setAutoContextLoading(false);
    }
  }, []);

  const handleAutoContextToggle = async () => {
    const newValue = !autoContextEnabled;
    setAutoContextEnabled(newValue); // Optimistic update
    try {
      const result = await autoContextApi.set(newValue);
      if (!result.success) {
        setAutoContextEnabled(!newValue); // Revert on failure
      }
    } catch {
      setAutoContextEnabled(!newValue); // Revert on failure
    }
  };

  const loadRules = useCallback(async () => {
    setIsLoading(true);
    try {
      const result = await vfRulesApi.get();
      if (result.success && result.data) {
        setRules(result.data.content);
        setIsDefault(result.data.isDefault);
        setIsDirty(false);
      }
    } catch {
      // Failed to load
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadRules();
    loadAutoContext();
  }, [loadRules, loadAutoContext]);

  const handleSave = async () => {
    setIsSaving(true);
    setSaveResult(null);
    try {
      const result = await vfRulesApi.save(rules);
      if (result.success) {
        setIsDirty(false);
        setIsDefault(false);
        setSaveResult('Saved! Changes apply to new sessions.');
        setTimeout(() => setSaveResult(null), 4000);
      }
    } catch (err) {
      setSaveResult(
        err instanceof Error ? err.message : 'Save failed'
      );
      setTimeout(() => setSaveResult(null), 4000);
    } finally {
      setIsSaving(false);
    }
  };

  const handleReset = async () => {
    setIsSaving(true);
    setSaveResult(null);
    try {
      const result = await vfRulesApi.reset();
      if (result.success && result.data) {
        setRules(result.data.content);
        setIsDefault(true);
        setIsDirty(false);
        setSaveResult('Reset to default rules');
        setTimeout(() => setSaveResult(null), 4000);
      }
    } catch {
      setSaveResult('Reset failed');
      setTimeout(() => setSaveResult(null), 4000);
    } finally {
      setIsSaving(false);
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
    <div className="space-y-6">
      {/* Internal Rules Section */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="flex items-center gap-2 font-display text-sm font-bold uppercase tracking-wider text-foreground">
            <Shield className="h-4 w-4 text-primary" />
            Internal Rules
          </h3>
          <div className="flex items-center gap-2">
            {!isDefault && (
              <button
                onClick={handleReset}
                disabled={isSaving}
                className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium hover:bg-accent transition-colors disabled:opacity-50"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Reset
              </button>
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

        <p className="text-xs text-muted-foreground leading-relaxed">
          These rules are prepended to your CLAUDE.md inside every sandbox container.
          They tell Claude about its environment so it behaves correctly in the cloud.
          Changes apply to <strong>new sessions only</strong>.
        </p>

        {isDefault && (
          <div className="flex items-start gap-2 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2">
            <Info className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-primary" />
            <p className="text-xs text-primary/80">
              Using default rules. Edit below to customize.
            </p>
          </div>
        )}

        <textarea
          value={rules}
          onChange={(e) => {
            setRules(e.target.value);
            setIsDirty(true);
            setSaveResult(null);
          }}
          className="h-80 w-full resize-y rounded-lg border border-border bg-muted px-4 py-3 font-mono text-xs leading-relaxed text-foreground focus:border-primary focus:outline-none"
          spellCheck={false}
        />

        {saveResult && (
          <p className={`text-xs ${
            saveResult.includes('fail') || saveResult.includes('Failed')
              ? 'text-red-400'
              : 'text-emerald-400'
          }`}>
            {saveResult}
          </p>
        )}
      </div>

      {/* Auto-Context Section */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="flex items-center gap-2 font-display text-sm font-bold uppercase tracking-wider text-foreground">
            <Zap className="h-4 w-4 text-primary" />
            Auto-Context
          </h3>
          {autoContextLoading ? (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          ) : (
            <button
              onClick={handleAutoContextToggle}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                autoContextEnabled ? 'bg-primary' : 'bg-muted-foreground/30'
              }`}
              role="switch"
              aria-checked={autoContextEnabled}
            >
              <span
                className={`inline-block h-4 w-4 rounded-full bg-white transition-transform ${
                  autoContextEnabled ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          )}
        </div>

        <p className="text-xs text-muted-foreground leading-relaxed">
          Automatically gathers project state at session start and injects it
          into Claude's system prompt. Claude knows your project before you
          say anything. Changes apply to <strong>new sessions only</strong>.
        </p>

        <div className="grid grid-cols-2 gap-2">
          <div className="flex items-start gap-2 rounded-lg border border-border bg-card px-3 py-2">
            <GitBranch className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-primary" />
            <div>
              <p className="text-xs font-medium text-foreground">Git State</p>
              <p className="text-[10px] text-muted-foreground">Branch, status, recent commits</p>
            </div>
          </div>
          <div className="flex items-start gap-2 rounded-lg border border-border bg-card px-3 py-2">
            <CheckSquare className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-primary" />
            <div>
              <p className="text-xs font-medium text-foreground">TODOs</p>
              <p className="text-[10px] text-muted-foreground">TODO, FIXME, HACK markers</p>
            </div>
          </div>
          <div className="flex items-start gap-2 rounded-lg border border-border bg-card px-3 py-2">
            <BarChart3 className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-primary" />
            <div>
              <p className="text-xs font-medium text-foreground">Code Metrics</p>
              <p className="text-[10px] text-muted-foreground">File counts, deps, coverage</p>
            </div>
          </div>
          <div className="flex items-start gap-2 rounded-lg border border-border bg-card px-3 py-2">
            <FileText className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-primary" />
            <div>
              <p className="text-xs font-medium text-foreground">Last Session</p>
              <p className="text-[10px] text-muted-foreground">Previous session summary</p>
            </div>
          </div>
        </div>
      </div>

      {/* System Prompt Section (read-only) */}
      <div className="space-y-3">
        <button
          onClick={() => setShowPrompt(!showPrompt)}
          className="flex w-full items-center gap-2 text-left"
        >
          <h3 className="flex items-center gap-2 font-display text-sm font-bold uppercase tracking-wider text-foreground">
            <Terminal className="h-4 w-4 text-primary" />
            SDK System Prompt
          </h3>
          {showPrompt ? (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          )}
        </button>

        {showPrompt && (
          <>
            <p className="text-xs text-muted-foreground leading-relaxed">
              The system prompt passed to the Claude Agent SDK. This is
              hardcoded in the container agent script and cannot be edited
              from the UI.
            </p>
            <div className="rounded-lg border border-border bg-muted/50 px-4 py-3">
              <p className="font-mono text-xs text-muted-foreground leading-relaxed">
                {SYSTEM_PROMPT}
              </p>
            </div>
          </>
        )}
      </div>

      {/* Injection Order Info */}
      <div className="space-y-2 rounded-lg border border-border bg-card px-4 py-3">
        <h4 className="font-display text-xs font-bold uppercase tracking-wider text-muted-foreground">
          Config Injection Order
        </h4>
        <ol className="list-inside list-decimal space-y-1 text-xs text-muted-foreground leading-relaxed">
          <li>
            <strong className="text-foreground">Internal Rules</strong>{' '}
            (above) — prepended to CLAUDE.md
          </li>
          <li>
            <strong className="text-foreground">CLAUDE.md</strong>{' '}
            — your personal config (Settings &gt; CLAUDE.md)
          </li>
          <li>
            <strong className="text-foreground">MCP Servers</strong>{' '}
            — written to ~/.claude.json
          </li>
          <li>
            <strong className="text-foreground">Plugin configs</strong>{' '}
            — agents, commands, rules from plugins
          </li>
          <li>
            <strong className="text-foreground">User configs</strong>{' '}
            — standalone rules, commands, agents
          </li>
          <li>
            <strong className="text-foreground">Secrets</strong>{' '}
            — injected as environment variables
          </li>
        </ol>
      </div>
    </div>
  );
}

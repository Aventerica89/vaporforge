import { useState, useEffect, useCallback } from 'react';
import {
  Loader2,
  Sparkles,
  Key,
  Eye,
  EyeOff,
  ExternalLink,
  Zap,
  Brain,
  CheckCircle,
  XCircle,
} from 'lucide-react';
import { aiProvidersApi, secretsApi } from '@/lib/api';
import type { AIProviderConfig } from '@/lib/types';

export function AIProvidersTab() {
  const [config, setConfig] = useState<AIProviderConfig>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // API key state
  const [apiKey, setApiKey] = useState('');
  const [keyHint, setKeyHint] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [isSavingKey, setSavingKey] = useState(false);
  const [keyStatus, setKeyStatus] = useState<'none' | 'set' | 'saving'>('none');

  // Model preference
  const [model, setModel] = useState<'flash' | 'pro'>('flash');

  const loadConfig = useCallback(async () => {
    setIsLoading(true);
    try {
      const [configResult, secretsResult] = await Promise.all([
        aiProvidersApi.get(),
        secretsApi.list(),
      ]);

      if (configResult.success && configResult.data) {
        setConfig(configResult.data);
        if (configResult.data.gemini?.defaultModel) {
          setModel(configResult.data.gemini.defaultModel);
        }
      }

      if (secretsResult.success && secretsResult.data) {
        const geminiKey = secretsResult.data.find((s) => s.name === 'GEMINI_API_KEY');
        if (geminiKey) {
          setKeyHint(geminiKey.hint);
          setKeyStatus('set');
        }
      }
    } catch {
      // Failed to load
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  const handleSaveKey = async () => {
    if (!apiKey.trim()) return;
    setSavingKey(true);
    setError('');
    try {
      const result = await secretsApi.add('GEMINI_API_KEY', apiKey.trim());
      if (result.success && result.data) {
        setKeyHint(result.data.hint);
        setKeyStatus('set');
        setApiKey('');
        setShowKey(false);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save API key');
    } finally {
      setSavingKey(false);
    }
  };

  const handleRemoveKey = async () => {
    try {
      await secretsApi.remove('GEMINI_API_KEY');
      setKeyHint('');
      setKeyStatus('none');
      // Also disable Gemini if key is removed
      if (config.gemini?.enabled) {
        await aiProvidersApi.disableGemini();
        setConfig({});
      }
    } catch {
      // Remove failed
    }
  };

  const handleToggle = async () => {
    setSaving(true);
    setError('');
    try {
      if (config.gemini?.enabled) {
        const result = await aiProvidersApi.disableGemini();
        if (result.success && result.data) setConfig(result.data);
      } else {
        if (keyStatus !== 'set') {
          setError('Add your Gemini API key first');
          setSaving(false);
          return;
        }
        const result = await aiProvidersApi.enableGemini({ defaultModel: model });
        if (result.success && result.data) setConfig(result.data);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update');
    } finally {
      setSaving(false);
    }
  };

  const handleModelChange = async (newModel: 'flash' | 'pro') => {
    setModel(newModel);
    if (config.gemini?.enabled) {
      try {
        const result = await aiProvidersApi.enableGemini({ defaultModel: newModel });
        if (result.success && result.data) setConfig(result.data);
      } catch {
        // Silent fail for model preference update
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

  const isEnabled = !!config.gemini?.enabled;

  return (
    <div className="space-y-6">
      <div>
        <h3 className="flex items-center gap-2 font-display text-sm font-bold uppercase tracking-wider text-foreground">
          <Sparkles className="h-4 w-4 text-primary" />
          AI Providers
        </h3>
        <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
          Connect additional AI models. Claude remains your primary agent —
          these providers are available as MCP tools Claude can delegate to.
        </p>
      </div>

      {/* Gemini Card */}
      <div className="rounded-lg border border-border bg-card overflow-hidden">
        {/* Card Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border/60">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-500/10">
              <Sparkles className="h-5 w-5 text-blue-400" />
            </div>
            <div>
              <h4 className="text-sm font-bold text-foreground">Google Gemini</h4>
              <p className="text-[10px] text-muted-foreground">
                Free tier: 1,000 req/day with personal Gmail
              </p>
            </div>
          </div>
          <button
            onClick={handleToggle}
            disabled={isSaving}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${
              isEnabled ? 'bg-primary' : 'bg-muted-foreground/30'
            }`}
          >
            {isSaving ? (
              <Loader2 className="absolute left-1/2 top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 animate-spin text-white" />
            ) : (
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  isEnabled ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            )}
          </button>
        </div>

        {/* Card Body */}
        <div className="px-4 py-3 space-y-4">
          {/* API Key Section */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <Key className="h-3.5 w-3.5" />
                API Key
              </label>
              {keyStatus === 'set' ? (
                <div className="flex items-center gap-2">
                  <span className="flex items-center gap-1 text-[10px] text-green-400">
                    <CheckCircle className="h-3 w-3" />
                    Configured {keyHint}
                  </span>
                  <button
                    onClick={handleRemoveKey}
                    className="text-[10px] text-red-400 hover:text-red-300 transition-colors"
                  >
                    Remove
                  </button>
                </div>
              ) : (
                <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                  <XCircle className="h-3 w-3" />
                  Not configured
                </span>
              )}
            </div>

            {keyStatus !== 'set' && (
              <div className="space-y-2">
                <div className="relative">
                  <input
                    type={showKey ? 'text' : 'password'}
                    value={apiKey}
                    onChange={(e) => { setApiKey(e.target.value); setError(''); }}
                    placeholder="AIza..."
                    className="w-full rounded border border-border bg-muted px-3 py-2 pr-9 text-sm font-mono focus:border-primary focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setShowKey(!showKey)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 hover:bg-accent transition-colors"
                  >
                    {showKey ? (
                      <EyeOff className="h-3.5 w-3.5 text-muted-foreground" />
                    ) : (
                      <Eye className="h-3.5 w-3.5 text-muted-foreground" />
                    )}
                  </button>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleSaveKey}
                    disabled={!apiKey.trim() || isSavingKey}
                    className="btn-primary flex items-center gap-1.5 px-3 py-1.5 text-xs disabled:opacity-50"
                  >
                    {isSavingKey ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Key className="h-3 w-3" />
                    )}
                    Save Key
                  </button>
                  <a
                    href="https://aistudio.google.com/apikey"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 text-[10px] text-primary hover:text-primary/80 transition-colors"
                  >
                    Get free API key
                    <ExternalLink className="h-2.5 w-2.5" />
                  </a>
                </div>
              </div>
            )}
          </div>

          {/* Model Preference */}
          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground">
              Default Model
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => handleModelChange('flash')}
                className={`flex items-center gap-2 rounded-lg border px-3 py-2.5 text-left transition-all ${
                  model === 'flash'
                    ? 'border-primary bg-primary/5 text-primary'
                    : 'border-border text-muted-foreground hover:border-primary/30'
                }`}
              >
                <Zap className="h-4 w-4 flex-shrink-0" />
                <div>
                  <div className="text-xs font-medium">Flash</div>
                  <div className="text-[10px] opacity-70">Fast responses</div>
                </div>
              </button>
              <button
                onClick={() => handleModelChange('pro')}
                className={`flex items-center gap-2 rounded-lg border px-3 py-2.5 text-left transition-all ${
                  model === 'pro'
                    ? 'border-primary bg-primary/5 text-primary'
                    : 'border-border text-muted-foreground hover:border-primary/30'
                }`}
              >
                <Brain className="h-4 w-4 flex-shrink-0" />
                <div>
                  <div className="text-xs font-medium">Pro</div>
                  <div className="text-[10px] opacity-70">Deep analysis</div>
                </div>
              </button>
            </div>
          </div>

          {/* Info */}
          <div className="rounded-md bg-muted/50 px-3 py-2">
            <p className="text-[10px] text-muted-foreground leading-relaxed">
              When enabled, Claude gains three Gemini tools:{' '}
              <code className="text-primary">gemini_quick_query</code>,{' '}
              <code className="text-primary">gemini_analyze_code</code>, and{' '}
              <code className="text-primary">gemini_codebase_analysis</code>.
              Use <code className="text-primary">/agent:gemini-expert</code> for
              full Gemini delegation. New sessions required for changes to take effect.
            </p>
          </div>

          {error && (
            <p className="text-xs text-red-400">{error}</p>
          )}
        </div>
      </div>
    </div>
  );
}

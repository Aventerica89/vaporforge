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
  Crown,
  Bot,
  Cpu,
} from 'lucide-react';
import { aiProvidersApi, secretsApi } from '@/lib/api';
import type { AIProviderConfig } from '@/lib/types';

interface ProviderKeyState {
  hint: string;
  status: 'none' | 'set';
}

export function AIProvidersTab() {
  const [config, setConfig] = useState<AIProviderConfig>({});
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  // Per-provider key state
  const [geminiKey, setGeminiKey] = useState<ProviderKeyState>({
    hint: '',
    status: 'none',
  });
  const [claudeKey, setClaudeKey] = useState<ProviderKeyState>({
    hint: '',
    status: 'none',
  });
  const [openaiKey, setOpenaiKey] = useState<ProviderKeyState>({
    hint: '',
    status: 'none',
  });

  // Model preferences
  const [geminiModel, setGeminiModel] = useState<'flash' | 'pro'>('flash');
  const [claudeModel, setClaudeModel] = useState<
    'sonnet' | 'haiku' | 'opus'
  >('sonnet');
  const [openaiModel, setOpenaiModel] = useState<
    'gpt-4o' | 'gpt-4o-mini' | 'o3' | 'o3-mini'
  >('gpt-4o');

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
          setGeminiModel(configResult.data.gemini.defaultModel);
        }
        if (configResult.data.claude?.defaultModel) {
          setClaudeModel(configResult.data.claude.defaultModel);
        }
        if (configResult.data.openai?.defaultModel) {
          setOpenaiModel(configResult.data.openai.defaultModel);
        }
      }

      if (secretsResult.success && secretsResult.data) {
        const gKey = secretsResult.data.find(
          (s) => s.name === 'GEMINI_API_KEY'
        );
        if (gKey) {
          setGeminiKey({ hint: gKey.hint, status: 'set' });
        }
        const cKey = secretsResult.data.find(
          (s) => s.name === 'ANTHROPIC_API_KEY'
        );
        if (cKey) {
          setClaudeKey({ hint: cKey.hint, status: 'set' });
        }
        const oKey = secretsResult.data.find(
          (s) => s.name === 'OPENAI_API_KEY'
        );
        if (oKey) {
          setOpenaiKey({ hint: oKey.hint, status: 'set' });
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

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-5 w-5 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="flex items-center gap-2 font-display text-sm font-bold uppercase tracking-wider text-foreground">
          <Sparkles className="h-4 w-4 text-primary" />
          AI Providers
        </h3>
        <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
          Connect AI providers for Quick Chat and Code Transform — instant
          responses without starting a sandbox.
        </p>
      </div>

      {/* Claude AI SDK Card */}
      <ClaudeProviderCard
        config={config}
        setConfig={setConfig}
        keyState={claudeKey}
        setKeyState={setClaudeKey}
        model={claudeModel}
        setModel={setClaudeModel}
        error={error}
        setError={setError}
      />

      {/* Gemini Card */}
      <GeminiProviderCard
        config={config}
        setConfig={setConfig}
        keyState={geminiKey}
        setKeyState={setGeminiKey}
        model={geminiModel}
        setModel={setGeminiModel}
        error={error}
        setError={setError}
      />

      {/* OpenAI Card */}
      <OpenAIProviderCard
        config={config}
        setConfig={setConfig}
        keyState={openaiKey}
        setKeyState={setOpenaiKey}
        model={openaiModel}
        setModel={setOpenaiModel}
        error={error}
        setError={setError}
      />
    </div>
  );
}

/* ── Claude Provider Card ─────────────────── */

function ClaudeProviderCard({
  config,
  setConfig,
  keyState,
  setKeyState,
  model,
  setModel,
  error,
  setError,
}: {
  config: AIProviderConfig;
  setConfig: (c: AIProviderConfig) => void;
  keyState: ProviderKeyState;
  setKeyState: (s: ProviderKeyState) => void;
  model: 'sonnet' | 'haiku' | 'opus';
  setModel: (m: 'sonnet' | 'haiku' | 'opus') => void;
  error: string;
  setError: (e: string) => void;
}) {
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [isSavingKey, setSavingKey] = useState(false);
  const [isSaving, setSaving] = useState(false);

  const isEnabled = !!config.claude?.enabled;

  const handleSaveKey = async () => {
    if (!apiKeyInput.trim()) return;
    setSavingKey(true);
    setError('');
    try {
      const result = await secretsApi.add(
        'ANTHROPIC_API_KEY',
        apiKeyInput.trim()
      );
      if (result.success && result.data) {
        setKeyState({ hint: result.data.hint, status: 'set' });
        setApiKeyInput('');
        setShowKey(false);
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to save API key'
      );
    } finally {
      setSavingKey(false);
    }
  };

  const handleRemoveKey = async () => {
    try {
      await secretsApi.remove('ANTHROPIC_API_KEY');
      setKeyState({ hint: '', status: 'none' });
      if (config.claude?.enabled) {
        const result = await aiProvidersApi.disableClaude();
        if (result.success && result.data) setConfig(result.data);
      }
    } catch {
      // Remove failed
    }
  };

  const handleToggle = async () => {
    setSaving(true);
    setError('');
    try {
      if (isEnabled) {
        const result = await aiProvidersApi.disableClaude();
        if (result.success && result.data) setConfig(result.data);
      } else {
        if (keyState.status !== 'set') {
          setError('Add your Anthropic API key first');
          setSaving(false);
          return;
        }
        const result = await aiProvidersApi.enableClaude({
          defaultModel: model,
        });
        if (result.success && result.data) setConfig(result.data);
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to update'
      );
    } finally {
      setSaving(false);
    }
  };

  const handleModelChange = async (
    newModel: 'sonnet' | 'haiku' | 'opus'
  ) => {
    setModel(newModel);
    if (config.claude?.enabled) {
      try {
        const result = await aiProvidersApi.enableClaude({
          defaultModel: newModel,
        });
        if (result.success && result.data) setConfig(result.data);
      } catch {
        // Silent fail
      }
    }
  };

  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border/60">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-orange-500/10">
            <Crown className="h-5 w-5 text-orange-400" />
          </div>
          <div>
            <h4 className="text-sm font-bold text-foreground">
              Claude (API Key)
            </h4>
            <p className="text-[10px] text-muted-foreground">
              Quick Chat + Code Transform — no sandbox needed
            </p>
          </div>
        </div>
        <ToggleSwitch
          enabled={isEnabled}
          saving={isSaving}
          onToggle={handleToggle}
        />
      </div>

      {/* Body */}
      <div className="px-4 py-3 space-y-4">
        {/* Key section */}
        <KeySection
          keyState={keyState}
          apiKeyInput={apiKeyInput}
          setApiKeyInput={(v) => {
            setApiKeyInput(v);
            setError('');
          }}
          showKey={showKey}
          setShowKey={setShowKey}
          isSavingKey={isSavingKey}
          onSave={handleSaveKey}
          onRemove={handleRemoveKey}
          placeholder="sk-ant-api01-..."
          getKeyLabel="Get API key"
          getKeyUrl="https://console.anthropic.com/settings/keys"
        />

        {/* Model selector — card tiles matching Gemini style */}
        <div className="space-y-2">
          <label className="text-xs font-medium text-muted-foreground">
            Default Model
          </label>
          <div className="grid grid-cols-3 gap-2">
            <ModelButton
              icon={<Zap className="h-4 w-4 flex-shrink-0" />}
              label="Sonnet"
              sublabel="Balanced"
              selected={model === 'sonnet'}
              onClick={() => handleModelChange('sonnet')}
            />
            <ModelButton
              icon={<Brain className="h-4 w-4 flex-shrink-0" />}
              label="Haiku"
              sublabel="Fast"
              selected={model === 'haiku'}
              onClick={() => handleModelChange('haiku')}
            />
            <ModelButton
              icon={<Crown className="h-4 w-4 flex-shrink-0" />}
              label="Opus"
              sublabel="Powerful"
              selected={model === 'opus'}
              onClick={() => handleModelChange('opus')}
            />
          </div>
        </div>

        {/* Info */}
        <div className="rounded-md bg-muted/50 px-3 py-2">
          <p className="text-[10px] text-muted-foreground leading-relaxed">
            Your OAuth token runs Claude Code in sandboxes. This separate
            API key enables{' '}
            <code className="text-primary">Quick Chat</code> and{' '}
            <code className="text-primary">Code Transform</code> directly
            in the Worker — instant responses, no container startup.
          </p>
        </div>

        {error && <p className="text-xs text-red-400">{error}</p>}
      </div>
    </div>
  );
}

/* ── Gemini Provider Card ─────────────────── */

function GeminiProviderCard({
  config,
  setConfig,
  keyState,
  setKeyState,
  model,
  setModel,
  error,
  setError,
}: {
  config: AIProviderConfig;
  setConfig: (c: AIProviderConfig) => void;
  keyState: ProviderKeyState;
  setKeyState: (s: ProviderKeyState) => void;
  model: 'flash' | 'pro';
  setModel: (m: 'flash' | 'pro') => void;
  error: string;
  setError: (e: string) => void;
}) {
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [isSavingKey, setSavingKey] = useState(false);
  const [isSaving, setSaving] = useState(false);

  const isEnabled = !!config.gemini?.enabled;

  const handleSaveKey = async () => {
    if (!apiKeyInput.trim()) return;
    setSavingKey(true);
    setError('');
    try {
      const result = await secretsApi.add(
        'GEMINI_API_KEY',
        apiKeyInput.trim()
      );
      if (result.success && result.data) {
        setKeyState({ hint: result.data.hint, status: 'set' });
        setApiKeyInput('');
        setShowKey(false);
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to save API key'
      );
    } finally {
      setSavingKey(false);
    }
  };

  const handleRemoveKey = async () => {
    try {
      await secretsApi.remove('GEMINI_API_KEY');
      setKeyState({ hint: '', status: 'none' });
      if (config.gemini?.enabled) {
        const result = await aiProvidersApi.disableGemini();
        if (result.success && result.data) setConfig(result.data);
      }
    } catch {
      // Remove failed
    }
  };

  const handleToggle = async () => {
    setSaving(true);
    setError('');
    try {
      if (isEnabled) {
        const result = await aiProvidersApi.disableGemini();
        if (result.success && result.data) setConfig(result.data);
      } else {
        if (keyState.status !== 'set') {
          setError('Add your Gemini API key first');
          setSaving(false);
          return;
        }
        const result = await aiProvidersApi.enableGemini({
          defaultModel: model,
        });
        if (result.success && result.data) setConfig(result.data);
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to update'
      );
    } finally {
      setSaving(false);
    }
  };

  const handleModelChange = async (newModel: 'flash' | 'pro') => {
    setModel(newModel);
    if (config.gemini?.enabled) {
      try {
        const result = await aiProvidersApi.enableGemini({
          defaultModel: newModel,
        });
        if (result.success && result.data) setConfig(result.data);
      } catch {
        // Silent fail
      }
    }
  };

  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border/60">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-500/10">
            <Sparkles className="h-5 w-5 text-blue-400" />
          </div>
          <div>
            <h4 className="text-sm font-bold text-foreground">
              Google Gemini
            </h4>
            <p className="text-[10px] text-muted-foreground">
              Flash: free, no billing needed. Pro: requires billing-linked GCP project.
            </p>
          </div>
        </div>
        <ToggleSwitch
          enabled={isEnabled}
          saving={isSaving}
          onToggle={handleToggle}
        />
      </div>

      {/* Body */}
      <div className="px-4 py-3 space-y-4">
        <KeySection
          keyState={keyState}
          apiKeyInput={apiKeyInput}
          setApiKeyInput={(v) => {
            setApiKeyInput(v);
            setError('');
          }}
          showKey={showKey}
          setShowKey={setShowKey}
          isSavingKey={isSavingKey}
          onSave={handleSaveKey}
          onRemove={handleRemoveKey}
          placeholder="AIza..."
          getKeyLabel="Get free API key"
          getKeyUrl="https://aistudio.google.com/apikey"
        />

        <div className="space-y-2">
          <label className="text-xs font-medium text-muted-foreground">
            Default Model
          </label>
          <div className="grid grid-cols-2 gap-2">
            <ModelButton
              icon={<Zap className="h-4 w-4 flex-shrink-0" />}
              label="Flash"
              sublabel="Fast responses"
              selected={model === 'flash'}
              onClick={() => handleModelChange('flash')}
            />
            <ModelButton
              icon={<Brain className="h-4 w-4 flex-shrink-0" />}
              label="Pro"
              sublabel="Deep analysis"
              selected={model === 'pro'}
              onClick={() => handleModelChange('pro')}
            />
          </div>
        </div>

        <div className="rounded-md bg-muted/50 px-3 py-2">
          <p className="text-[10px] text-muted-foreground leading-relaxed">
            Enables Quick Chat + Code Transform with Gemini, plus
            three MCP tools in sandboxes:{' '}
            <code className="text-primary">gemini_quick_query</code>,{' '}
            <code className="text-primary">gemini_analyze_code</code>,{' '}
            <code className="text-primary">gemini_codebase_analysis</code>.
          </p>
        </div>

        {error && <p className="text-xs text-red-400">{error}</p>}
      </div>
    </div>
  );
}

/* ── OpenAI Provider Card ─────────────────── */

type OpenAIModel = 'gpt-4o' | 'gpt-4o-mini' | 'o3' | 'o3-mini';

function OpenAIProviderCard({
  config,
  setConfig,
  keyState,
  setKeyState,
  model,
  setModel,
  error,
  setError,
}: {
  config: AIProviderConfig;
  setConfig: (c: AIProviderConfig) => void;
  keyState: ProviderKeyState;
  setKeyState: (s: ProviderKeyState) => void;
  model: OpenAIModel;
  setModel: (m: OpenAIModel) => void;
  error: string;
  setError: (e: string) => void;
}) {
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [isSavingKey, setSavingKey] = useState(false);
  const [isSaving, setSaving] = useState(false);

  const isEnabled = !!config.openai?.enabled;

  const handleSaveKey = async () => {
    if (!apiKeyInput.trim()) return;
    setSavingKey(true);
    setError('');
    try {
      const result = await secretsApi.add(
        'OPENAI_API_KEY',
        apiKeyInput.trim()
      );
      if (result.success && result.data) {
        setKeyState({ hint: result.data.hint, status: 'set' });
        setApiKeyInput('');
        setShowKey(false);
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to save API key'
      );
    } finally {
      setSavingKey(false);
    }
  };

  const handleRemoveKey = async () => {
    try {
      await secretsApi.remove('OPENAI_API_KEY');
      setKeyState({ hint: '', status: 'none' });
      if (config.openai?.enabled) {
        const result = await aiProvidersApi.disableOpenai();
        if (result.success && result.data) setConfig(result.data);
      }
    } catch {
      // Remove failed
    }
  };

  const handleToggle = async () => {
    setSaving(true);
    setError('');
    try {
      if (isEnabled) {
        const result = await aiProvidersApi.disableOpenai();
        if (result.success && result.data) setConfig(result.data);
      } else {
        if (keyState.status !== 'set') {
          setError('Add your OpenAI API key first');
          setSaving(false);
          return;
        }
        const result = await aiProvidersApi.enableOpenai({
          defaultModel: model,
        });
        if (result.success && result.data) setConfig(result.data);
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to update'
      );
    } finally {
      setSaving(false);
    }
  };

  const handleModelChange = async (newModel: OpenAIModel) => {
    setModel(newModel);
    if (config.openai?.enabled) {
      try {
        const result = await aiProvidersApi.enableOpenai({
          defaultModel: newModel,
        });
        if (result.success && result.data) setConfig(result.data);
      } catch {
        // Silent fail
      }
    }
  };

  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border/60">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-green-500/10">
            <Bot className="h-5 w-5 text-green-400" />
          </div>
          <div>
            <h4 className="text-sm font-bold text-foreground">
              OpenAI
            </h4>
            <p className="text-[10px] text-muted-foreground">
              GPT-4o, o3 reasoning — Quick Chat + Code Transform
            </p>
          </div>
        </div>
        <ToggleSwitch
          enabled={isEnabled}
          saving={isSaving}
          onToggle={handleToggle}
        />
      </div>

      {/* Body */}
      <div className="px-4 py-3 space-y-4">
        <KeySection
          keyState={keyState}
          apiKeyInput={apiKeyInput}
          setApiKeyInput={(v) => {
            setApiKeyInput(v);
            setError('');
          }}
          showKey={showKey}
          setShowKey={setShowKey}
          isSavingKey={isSavingKey}
          onSave={handleSaveKey}
          onRemove={handleRemoveKey}
          placeholder="sk-proj-..."
          getKeyLabel="Get API key"
          getKeyUrl="https://platform.openai.com/api-keys"
        />

        <div className="space-y-2">
          <label className="text-xs font-medium text-muted-foreground">
            Default Model
          </label>
          <div className="grid grid-cols-2 gap-2">
            <ModelButton
              icon={<Zap className="h-4 w-4 flex-shrink-0" />}
              label="GPT-4o"
              sublabel="Balanced"
              selected={model === 'gpt-4o'}
              onClick={() => handleModelChange('gpt-4o')}
            />
            <ModelButton
              icon={<Brain className="h-4 w-4 flex-shrink-0" />}
              label="GPT-4o Mini"
              sublabel="Fast"
              selected={model === 'gpt-4o-mini'}
              onClick={() => handleModelChange('gpt-4o-mini')}
            />
            <ModelButton
              icon={<Cpu className="h-4 w-4 flex-shrink-0" />}
              label="o3"
              sublabel="Reasoning"
              selected={model === 'o3'}
              onClick={() => handleModelChange('o3')}
            />
            <ModelButton
              icon={<Zap className="h-4 w-4 flex-shrink-0" />}
              label="o3-mini"
              sublabel="Fast reasoning"
              selected={model === 'o3-mini'}
              onClick={() => handleModelChange('o3-mini')}
            />
          </div>
        </div>

        <div className="rounded-md bg-muted/50 px-3 py-2">
          <p className="text-[10px] text-muted-foreground leading-relaxed">
            Enables Quick Chat + Code Transform with OpenAI models.
            Uses your API key directly — no OpenRouter needed.
          </p>
        </div>

        {error && <p className="text-xs text-red-400">{error}</p>}
      </div>
    </div>
  );
}

/* ── Shared sub-components ──────────────────── */

function ToggleSwitch({
  enabled,
  saving,
  onToggle,
}: {
  enabled: boolean;
  saving: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      onClick={onToggle}
      disabled={saving}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${
        enabled ? 'bg-primary' : 'bg-muted-foreground/30'
      }`}
    >
      {saving ? (
        <Loader2 className="absolute left-1/2 top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 animate-spin text-white" />
      ) : (
        <span
          className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
            enabled ? 'translate-x-6' : 'translate-x-1'
          }`}
        />
      )}
    </button>
  );
}

function KeySection({
  keyState,
  apiKeyInput,
  setApiKeyInput,
  showKey,
  setShowKey,
  isSavingKey,
  onSave,
  onRemove,
  placeholder,
  getKeyLabel,
  getKeyUrl,
}: {
  keyState: ProviderKeyState;
  apiKeyInput: string;
  setApiKeyInput: (v: string) => void;
  showKey: boolean;
  setShowKey: (v: boolean) => void;
  isSavingKey: boolean;
  onSave: () => void;
  onRemove: () => void;
  placeholder: string;
  getKeyLabel: string;
  getKeyUrl: string;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <Key className="h-3.5 w-3.5" />
          API Key
        </label>
        {keyState.status === 'set' ? (
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1 text-[10px] text-green-400">
              <CheckCircle className="h-3 w-3" />
              Configured {keyState.hint}
            </span>
            <button
              onClick={onRemove}
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

      {keyState.status !== 'set' && (
        <div className="space-y-2">
          <div className="relative">
            <input
              type={showKey ? 'text' : 'password'}
              value={apiKeyInput}
              onChange={(e) => setApiKeyInput(e.target.value)}
              placeholder={placeholder}
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
              onClick={onSave}
              disabled={!apiKeyInput.trim() || isSavingKey}
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
              href={getKeyUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-[10px] text-primary hover:text-primary/80 transition-colors"
            >
              {getKeyLabel}
              <ExternalLink className="h-2.5 w-2.5" />
            </a>
          </div>
        </div>
      )}
    </div>
  );
}

function ModelButton({
  icon,
  label,
  sublabel,
  selected,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  sublabel: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex flex-col items-center justify-center gap-1.5 rounded-lg border p-3 transition-all ${
        selected
          ? 'border-primary bg-primary/5 text-primary'
          : 'border-border text-muted-foreground hover:border-primary/30'
      }`}
      style={{ minHeight: '60px' }}
    >
      {icon}
      <div className="text-center">
        <div className="text-xs font-medium">{label}</div>
        <div className="text-[10px] opacity-70">{sublabel}</div>
      </div>
    </button>
  );
}

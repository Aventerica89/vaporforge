import { useState, useEffect, useCallback } from 'react';
import { Plus, Trash2, Key, Loader2, X, Eye, EyeOff, RefreshCw } from 'lucide-react';
import { secretsApi } from '@/lib/api';

interface SecretEntry {
  name: string;
  hint: string;
}

export function SecretsTab() {
  const [secrets, setSecrets] = useState<SecretEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState('');
  const [newValue, setNewValue] = useState('');
  const [showValue, setShowValue] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const [error, setError] = useState('');

  const loadSecrets = useCallback(async () => {
    setIsLoading(true);
    try {
      const result = await secretsApi.list();
      if (result.success && result.data) {
        setSecrets(result.data);
      }
    } catch {
      // Failed to load
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSecrets();
  }, [loadSecrets]);

  const handleAdd = async () => {
    if (!newName || !newValue) return;
    setIsAdding(true);
    setError('');
    try {
      const result = await secretsApi.add(newName, newValue);
      if (result.success) {
        setShowAdd(false);
        setNewName('');
        setNewValue('');
        setShowValue(false);
        await loadSecrets();
      } else {
        setError(result.error || 'Failed to add secret');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add secret');
    } finally {
      setIsAdding(false);
    }
  };

  const handleRemove = async (name: string) => {
    try {
      await secretsApi.remove(name);
      await loadSecrets();
    } catch {
      // Remove failed
    }
  };

  const handleNameChange = (value: string) => {
    // Auto-uppercase and strip invalid chars for env var names
    setNewName(value.toUpperCase().replace(/[^A-Z0-9_]/g, ''));
    setError('');
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-5 w-5 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="flex items-center gap-2 font-display text-sm font-bold uppercase tracking-wider text-foreground">
          <Key className="h-4 w-4 text-primary" />
          Environment Secrets
        </h3>
        <button
          onClick={() => { setShowAdd(!showAdd); setError(''); }}
          className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium hover:bg-accent transition-colors"
        >
          {showAdd ? (
            <X className="h-3.5 w-3.5" />
          ) : (
            <Plus className="h-3.5 w-3.5 text-primary" />
          )}
          {showAdd ? 'Cancel' : 'Add'}
        </button>
      </div>

      <p className="text-xs text-muted-foreground leading-relaxed">
        Secrets injected as env vars into every session.
        Available in terminal and to Claude via{' '}
        <code className="text-primary">$SECRET_NAME</code>.
      </p>

      {/* Important info banner about session refresh */}
      <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 space-y-2">
        <div className="flex items-start gap-2">
          <RefreshCw className="h-4 w-4 text-amber-400 flex-shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="text-xs font-medium text-amber-200">
              Changes require a new session
            </p>
            <p className="text-xs text-amber-300/80 leading-relaxed">
              Secrets are only injected when creating a session. After adding or updating secrets, create a new session for them to take effect.
            </p>
          </div>
        </div>
      </div>

      {/* 1Password integration info */}
      {secrets.some(s => s.name === 'OP_SERVICE_ACCOUNT_TOKEN') && (
        <div className="rounded-lg border border-primary/30 bg-primary/10 p-3 space-y-2">
          <div className="flex items-start gap-2">
            <Key className="h-4 w-4 text-primary flex-shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="text-xs font-medium text-foreground">
                1Password integration active
              </p>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Claude can access secrets using:{' '}
                <code className="text-xs text-primary bg-background/50 px-1 py-0.5 rounded">
                  op read "op://Vault/Item/field"
                </code>
              </p>
            </div>
          </div>
        </div>
      )}

      {showAdd && (
        <div className="space-y-2 rounded-lg border border-border p-3">
          <input
            type="text"
            value={newName}
            onChange={(e) => handleNameChange(e.target.value)}
            placeholder="SECRET_NAME"
            className="w-full rounded border border-border bg-muted px-3 py-2 text-sm font-mono uppercase focus:border-primary focus:outline-none"
          />
          <div className="relative">
            <input
              type={showValue ? 'text' : 'password'}
              value={newValue}
              onChange={(e) => { setNewValue(e.target.value); setError(''); }}
              placeholder="Secret value"
              className="w-full rounded border border-border bg-muted px-3 py-2 pr-9 text-sm font-mono focus:border-primary focus:outline-none"
            />
            <button
              type="button"
              onClick={() => setShowValue(!showValue)}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 hover:bg-accent transition-colors"
            >
              {showValue ? (
                <EyeOff className="h-3.5 w-3.5 text-muted-foreground" />
              ) : (
                <Eye className="h-3.5 w-3.5 text-muted-foreground" />
              )}
            </button>
          </div>
          {error && (
            <p className="text-xs text-red-400">{error}</p>
          )}
          <button
            onClick={handleAdd}
            disabled={!newName || !newValue || isAdding}
            className="btn-primary flex items-center gap-1.5 px-3 py-1.5 text-xs disabled:opacity-50"
          >
            {isAdding ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Plus className="h-3 w-3" />
            )}
            Add Secret
          </button>
        </div>
      )}

      {secrets.length === 0 ? (
        <p className="text-sm text-muted-foreground py-4 text-center">
          No secrets configured
        </p>
      ) : (
        <div className="space-y-1">
          {secrets.map((secret) => (
            <div
              key={secret.name}
              className="group flex items-center justify-between rounded-lg px-3 py-2.5 hover:bg-accent/50 transition-colors"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <Key className="h-3.5 w-3.5 flex-shrink-0 text-primary" />
                  <span className="text-sm font-medium font-mono truncate">
                    {secret.name}
                  </span>
                </div>
                <p className="mt-0.5 truncate pl-[22px] text-[10px] text-muted-foreground font-mono">
                  {secret.hint}
                </p>
              </div>
              <button
                onClick={() => handleRemove(secret.name)}
                className="ml-2 flex-shrink-0 rounded p-1 opacity-0 group-hover:opacity-100 hover:bg-red-500/10 hover:text-red-500 transition-all"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

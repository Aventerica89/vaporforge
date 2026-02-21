import { useState, useEffect } from 'react';
import { Bell, BellOff, Plus, Trash2, Zap, Loader2 } from 'lucide-react';
import { billingApi, maxBudgetApi, type AlertConfig } from '@/lib/api';
import { cn } from '@/lib/utils';

const PRESET_THRESHOLDS = [50, 75, 80, 90];

function formatThreshold(pct: number, budgetUsd: number | null): string {
  if (budgetUsd) {
    const dollar = ((pct / 100) * budgetUsd).toFixed(2);
    return `Alert at ${pct}% · $${dollar}`;
  }
  return `Alert at ${pct}%`;
}

function formatTriggered(alert: AlertConfig): string {
  if (alert.triggeredCount === 0) return 'Never triggered';
  const when = alert.triggeredAt
    ? new Date(alert.triggeredAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : 'Unknown date';
  return `Last triggered ${when} · ${alert.triggeredCount}× total`;
}

interface CreateFormProps {
  budgetUsd: number | null;
  onSave: (thresholdPct: number, label: string) => Promise<void>;
  onCancel: () => void;
  saving: boolean;
}

function CreateForm({ budgetUsd, onSave, onCancel, saving }: CreateFormProps) {
  const [selected, setSelected] = useState<number>(80);
  const [custom, setCustom] = useState('');
  const [useCustom, setUseCustom] = useState(false);

  const effectivePct = useCustom ? Number(custom) : selected;
  const invalid = useCustom && (isNaN(effectivePct) || effectivePct < 1 || effectivePct > 99);

  return (
    <div className="rounded-lg border border-border bg-muted/20 p-4 space-y-4">
      <p className="text-xs font-medium text-foreground">New alert threshold</p>

      {/* Preset pills */}
      <div className="flex flex-wrap gap-2">
        {PRESET_THRESHOLDS.map((pct) => (
          <button
            key={pct}
            onClick={() => { setSelected(pct); setUseCustom(false); }}
            className={cn(
              'rounded-full px-3 py-1 text-xs font-medium border transition-colors',
              !useCustom && selected === pct
                ? 'border-primary bg-primary/10 text-primary'
                : 'border-border bg-muted/30 text-muted-foreground hover:border-primary/50'
            )}
          >
            {pct}%
            {budgetUsd ? ` · $${((pct / 100) * budgetUsd).toFixed(0)}` : ''}
          </button>
        ))}
        <button
          onClick={() => setUseCustom(true)}
          className={cn(
            'rounded-full px-3 py-1 text-xs font-medium border transition-colors',
            useCustom
              ? 'border-primary bg-primary/10 text-primary'
              : 'border-border bg-muted/30 text-muted-foreground hover:border-primary/50'
          )}
        >
          Custom
        </button>
      </div>

      {useCustom && (
        <div className="flex items-center gap-2">
          <input
            type="number"
            min="1"
            max="99"
            placeholder="e.g. 65"
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
            className="w-24 rounded-md border border-border bg-muted/30 px-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          />
          <span className="text-xs text-muted-foreground">%</span>
        </div>
      )}

      {/* Channel info */}
      <div className="flex items-center gap-1.5">
        <span className="text-[10px] text-muted-foreground">Notify via:</span>
        <span className="rounded-full bg-indigo-500/10 border border-indigo-500/30 px-2 py-0.5 text-[10px] font-medium text-indigo-400">
          In-App
        </span>
      </div>

      <div className="flex gap-2">
        <button
          onClick={() => onSave(effectivePct, `Alert at ${effectivePct}%`)}
          disabled={saving || invalid || (useCustom && !custom)}
          className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
          {saving ? 'Saving...' : 'Create Alert'}
        </button>
        <button
          onClick={onCancel}
          disabled={saving}
          className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

interface AlertCardProps {
  alert: AlertConfig;
  budgetUsd: number | null;
  onToggle: () => void;
  onDelete: () => void;
  toggling: boolean;
  deleting: boolean;
}

function AlertCard({ alert, budgetUsd, onToggle, onDelete, toggling, deleting }: AlertCardProps) {
  return (
    <div
      className={cn(
        'rounded-lg border bg-muted/20 p-4 space-y-3 transition-opacity',
        !alert.enabled && 'opacity-60'
      )}
      style={{ borderColor: alert.enabled ? 'hsl(var(--border))' : 'hsl(var(--border))' }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className={cn(
            'flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg',
            alert.enabled ? 'bg-indigo-500/10' : 'bg-muted'
          )}>
            {alert.enabled
              ? <Bell className="h-4 w-4 text-indigo-400" />
              : <BellOff className="h-4 w-4 text-muted-foreground" />
            }
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium text-foreground truncate">{alert.label}</p>
            <p className="text-xs text-muted-foreground">
              {formatThreshold(alert.thresholdPct, budgetUsd)}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 flex-shrink-0">
          <span className={cn(
            'rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide border',
            alert.enabled
              ? 'bg-green-500/10 text-green-400 border-green-500/30'
              : 'bg-muted text-muted-foreground border-border'
          )}>
            {alert.enabled ? 'Active' : 'Paused'}
          </span>
        </div>
      </div>

      {/* Channels */}
      <div className="flex items-center gap-1.5">
        {alert.channels.map((ch) => (
          <span
            key={ch}
            className="rounded-full bg-indigo-500/10 border border-indigo-500/20 px-2 py-0.5 text-[10px] font-medium text-indigo-400"
          >
            {ch === 'in-app' ? 'In-App' : ch}
          </span>
        ))}
      </div>

      {/* Trigger history */}
      <div className="flex items-center gap-1.5">
        <Zap className={cn('h-3 w-3 flex-shrink-0', alert.triggeredCount > 0 ? 'text-amber-400' : 'text-muted-foreground')} />
        <span className="text-[11px] text-muted-foreground">{formatTriggered(alert)}</span>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 pt-1 border-t border-border/50">
        <button
          onClick={onToggle}
          disabled={toggling}
          className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground disabled:opacity-40"
        >
          {toggling ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
          {alert.enabled ? 'Pause' : 'Enable'}
        </button>
        <span className="text-border">·</span>
        <button
          onClick={onDelete}
          disabled={deleting}
          className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground transition-colors hover:text-red-400 disabled:opacity-40"
        >
          {deleting
            ? <Loader2 className="h-3 w-3 animate-spin" />
            : <Trash2 className="h-3 w-3" />
          }
          Delete
        </button>
      </div>
    </div>
  );
}

export function UsageAlertsCard() {
  const [alerts, setAlerts] = useState<AlertConfig[]>([]);
  const [budgetUsd, setBudgetUsd] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [saving, setSaving] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([
      billingApi.alerts.list(),
      maxBudgetApi.get(),
    ])
      .then(([alertsRes, budgetRes]) => {
        if (alertsRes.success && alertsRes.data) setAlerts(alertsRes.data.alerts);
        if (budgetRes.success && budgetRes.data) setBudgetUsd(budgetRes.data.maxBudgetUsd);
      })
      .catch(() => setError('Failed to load alerts'))
      .finally(() => setLoading(false));
  }, []);

  const handleCreate = async (thresholdPct: number, label: string) => {
    setSaving(true);
    setError('');
    try {
      const res = await billingApi.alerts.create({ thresholdPct, label });
      if (res.success && res.data) {
        setAlerts((prev) => [...prev, res.data!.alert]);
        setShowCreate(false);
      }
    } catch {
      setError('Failed to create alert');
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = async (id: string) => {
    setTogglingId(id);
    try {
      const res = await billingApi.alerts.toggle(id);
      if (res.success && res.data) {
        setAlerts((prev) => prev.map((a) => (a.id === id ? res.data!.alert : a)));
      }
    } catch {
      setError('Failed to toggle alert');
    } finally {
      setTogglingId(null);
    }
  };

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    try {
      const res = await billingApi.alerts.delete(id);
      if (res.success) {
        setAlerts((prev) => prev.filter((a) => a.id !== id));
      }
    } catch {
      setError('Failed to delete alert');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <section className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="space-y-0.5">
          <h4 className="flex items-center gap-2 text-sm font-medium text-foreground">
            <Bell className="h-4 w-4 text-primary" />
            Usage Alerts
          </h4>
          <p className="text-xs text-muted-foreground">
            {budgetUsd
              ? `Get notified before you reach your $${budgetUsd.toFixed(0)} session limit.`
              : 'Get notified when you approach your usage limits.'}
          </p>
        </div>

        {!showCreate && (
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-1.5 rounded-lg border border-border bg-muted/30 px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted"
          >
            <Plus className="h-3.5 w-3.5" />
            Create Alert
          </button>
        )}
      </div>

      {!budgetUsd && !loading && (
        <p className="text-[11px] text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2">
          Set a session budget limit in the AI Settings tab to use threshold alerts.
        </p>
      )}

      {loading ? (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Loading alerts...
        </div>
      ) : (
        <div className="space-y-3">
          {showCreate && (
            <CreateForm
              budgetUsd={budgetUsd}
              onSave={handleCreate}
              onCancel={() => setShowCreate(false)}
              saving={saving}
            />
          )}

          {alerts.length === 0 && !showCreate ? (
            <div className="rounded-lg border border-dashed border-border px-4 py-6 text-center">
              <Bell className="mx-auto h-6 w-6 text-muted-foreground/40 mb-2" />
              <p className="text-xs text-muted-foreground">No alerts configured.</p>
              <p className="text-[11px] text-muted-foreground/60 mt-0.5">
                Create one to get notified before hitting your budget.
              </p>
            </div>
          ) : (
            alerts.map((alert) => (
              <AlertCard
                key={alert.id}
                alert={alert}
                budgetUsd={budgetUsd}
                onToggle={() => handleToggle(alert.id)}
                onDelete={() => handleDelete(alert.id)}
                toggling={togglingId === alert.id}
                deleting={deletingId === alert.id}
              />
            ))
          )}
        </div>
      )}

      {error && <p className="text-xs text-red-400">{error}</p>}
    </section>
  );
}

import type { Plugin } from '@/lib/types';

export type ViewTab = 'plugins' | 'mcps';

export type PluginTier = 'official' | 'community' | 'custom';

export function deriveTier(plugin: Plugin): PluginTier {
  if (plugin.builtIn) return 'official';
  if (!plugin.repoUrl && plugin.scope === 'local') return 'custom';
  return 'community';
}

export const TIER_CONFIG: Record<PluginTier, {
  label: string;
  badgeClass: string;
  color: string;
}> = {
  official: {
    label: 'Official Plugins',
    badgeClass: 'bg-primary/10 text-primary border-primary/30',
    color: 'primary',
  },
  community: {
    label: 'Community Plugins',
    badgeClass: 'bg-violet-500/10 text-violet-400 border-violet-500/30',
    color: 'violet',
  },
  custom: {
    label: 'Custom (You)',
    badgeClass: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
    color: 'amber',
  },
};

export const TRANSPORT_BADGE: Record<string, string> = {
  http: 'bg-primary/10 text-primary border-primary/30',
  stdio: 'bg-violet-500/10 text-violet-400 border-violet-500/30',
  relay: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
};

export const STATUS_CONFIG = {
  connected: { dot: 'bg-green-500 shadow-[0_0_4px_theme(colors.green.500)]', label: 'Connected' },
  disabled: { dot: 'bg-muted-foreground', label: 'Disabled' },
  error: { dot: 'bg-red-500 shadow-[0_0_4px_theme(colors.red.500)]', label: 'Error' },
} as const;

export type McpStatus = keyof typeof STATUS_CONFIG;

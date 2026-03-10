import { useState, useEffect, useCallback, useRef } from 'react';
import { configApi, pluginsApi } from '@/lib/api';

export interface CommandEntry {
  name: string;
  /** Original filename (e.g. 'docs.md') — used to derive the SDK slash command name */
  filename: string;
  description: string;
  source: 'user' | string;
  content: string;
  kind: 'command' | 'agent';
}

/**
 * Extract a one-line description from markdown content:
 * first non-empty line that isn't a heading (# ...).
 */
function extractDescription(content: string): string {
  const lines = content.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (trimmed.startsWith('#')) continue;
    return trimmed.length > 80 ? `${trimmed.slice(0, 77)}...` : trimmed;
  }
  return '';
}

function stripExtension(filename: string): string {
  return filename.replace(/\.(md|txt)$/, '');
}

export function useCommandRegistry() {
  const [commands, setCommands] = useState<CommandEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fetchedRef = useRef(false);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const [configCmds, configAgents, pluginsResult] = await Promise.all([
        configApi.list('commands'),
        configApi.list('agents'),
        pluginsApi.list(),
      ]);

      const entries: CommandEntry[] = [];

      // User-defined standalone commands
      if (configCmds.success && configCmds.data) {
        for (const file of configCmds.data) {
          if (!file.enabled) continue;
          entries.push({
            name: stripExtension(file.filename),
            filename: file.filename,
            description: extractDescription(file.content),
            source: 'user',
            content: file.content,
            kind: 'command',
          });
        }
      }

      // User-defined standalone agents
      if (configAgents.success && configAgents.data) {
        for (const file of configAgents.data) {
          if (!file.enabled) continue;
          entries.push({
            name: stripExtension(file.filename),
            filename: file.filename,
            description: extractDescription(file.content),
            source: 'user',
            content: file.content,
            kind: 'agent',
          });
        }
      }

      // Plugin commands + agents
      if (pluginsResult.success && pluginsResult.data) {
        for (const plugin of pluginsResult.data) {
          if (!plugin.enabled) continue;
          for (const cmd of plugin.commands) {
            if (!cmd.enabled) continue;
            // Always prefer filename-derived name (matches SDK slash command name)
            const derivedName = stripExtension(cmd.filename);
            entries.push({
              name: derivedName,
              filename: cmd.filename,
              description: extractDescription(cmd.content),
              source: plugin.name,
              content: cmd.content,
              kind: 'command',
            });
          }
          for (const agent of plugin.agents) {
            if (!agent.enabled) continue;
            const derivedName = stripExtension(agent.filename);
            entries.push({
              name: derivedName,
              filename: agent.filename,
              description: extractDescription(agent.content),
              source: plugin.name,
              content: agent.content,
              kind: 'agent',
            });
          }
        }
      }

      entries.sort((a, b) => a.name.localeCompare(b.name));
      setCommands(entries);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      console.error('[useCommandRegistry] Failed to load commands:', msg);
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    load();
  }, [load]);

  const refresh = useCallback(() => {
    fetchedRef.current = false;
    load();
  }, [load]);

  return { commands, isLoading, error, refresh };
}

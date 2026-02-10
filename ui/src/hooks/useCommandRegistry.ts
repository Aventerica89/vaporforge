import { useState, useEffect, useCallback, useRef } from 'react';
import { configApi, pluginsApi } from '@/lib/api';

export interface CommandEntry {
  name: string;
  description: string;
  source: 'user' | string;
  content: string;
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
  const fetchedRef = useRef(false);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const [configResult, pluginsResult] = await Promise.all([
        configApi.list('commands'),
        pluginsApi.list(),
      ]);

      const entries: CommandEntry[] = [];

      // User-defined standalone commands
      if (configResult.success && configResult.data) {
        for (const file of configResult.data) {
          if (!file.enabled) continue;
          entries.push({
            name: stripExtension(file.filename),
            description: extractDescription(file.content),
            source: 'user',
            content: file.content,
          });
        }
      }

      // Plugin commands
      if (pluginsResult.success && pluginsResult.data) {
        for (const plugin of pluginsResult.data) {
          if (!plugin.enabled) continue;
          for (const cmd of plugin.commands) {
            if (!cmd.enabled) continue;
            entries.push({
              name: stripExtension(cmd.filename),
              description: extractDescription(cmd.content),
              source: plugin.name,
              content: cmd.content,
            });
          }
        }
      }

      entries.sort((a, b) => a.name.localeCompare(b.name));
      setCommands(entries);
    } catch {
      // Silently fail — commands are optional UX enhancement
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

  return { commands, isLoading, refresh };
}

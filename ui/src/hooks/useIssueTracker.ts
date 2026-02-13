import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { issuesApi, vaporFilesApi } from '@/lib/api';

export interface IssueScreenshot {
  id: string;
  dataUrl: string;
  fileUrl?: string; // VaporFiles URL (if uploaded)
}

export interface Issue {
  id: string;
  title: string;
  description: string;
  type: 'bug' | 'error' | 'feature' | 'suggestion';
  size: 'S' | 'M' | 'L';
  screenshots: IssueScreenshot[];
  claudeNote?: string;
  resolved: boolean;
  createdAt: string;
}

export type IssueFilter = 'all' | 'bug' | 'error' | 'feature' | 'suggestion' | 'resolved';

interface IssueTrackerState {
  issues: Issue[];
  suggestions: string;
  isOpen: boolean;
  filter: IssueFilter;
  syncing: boolean;
  migrated: boolean;

  openTracker: () => void;
  closeTracker: () => void;
  setFilter: (filter: IssueFilter) => void;

  addIssue: (issue: Omit<Issue, 'id' | 'createdAt' | 'resolved' | 'screenshots'>) => void;
  updateIssue: (id: string, updates: Partial<Pick<Issue, 'title' | 'description' | 'type' | 'size'>>) => void;
  removeIssue: (id: string) => void;
  toggleResolved: (id: string) => void;
  reorderIssues: (fromIndex: number, toIndex: number) => void;

  addScreenshot: (issueId: string, screenshot: IssueScreenshot) => void;
  removeScreenshot: (issueId: string, screenshotId: string) => void;

  setClaudeNote: (issueId: string, note: string) => void;
  setSuggestions: (text: string) => void;

  exportMarkdown: () => string;

  // Backend sync methods
  loadFromBackend: () => Promise<void>;
  syncToBackend: () => Promise<void>;
}

export function buildMarkdown(issues: Issue[], suggestions: string, useFileUrls = true): string {
  const lines: string[] = ['# Issue Tracker Export', ''];
  const now = new Date().toISOString().slice(0, 10);
  lines.push(`Exported: ${now}`, '');

  const open = issues.filter((i) => !i.resolved);
  const resolved = issues.filter((i) => i.resolved);

  if (open.length > 0) {
    lines.push('## Open Issues', '');
    for (const issue of open) {
      lines.push(formatIssue(issue, useFileUrls));
    }
  }

  if (resolved.length > 0) {
    lines.push('## Resolved', '');
    for (const issue of resolved) {
      lines.push(formatIssue(issue, useFileUrls));
    }
  }

  if (suggestions.trim()) {
    lines.push('## Claude Suggestions', '', suggestions.trim(), '');
  }

  return lines.join('\n');
}

export function formatIssue(issue: Issue, useFileUrls = true): string {
  const badge = issue.type.toUpperCase();
  const check = issue.resolved ? 'x' : ' ';
  const lines: string[] = [];
  lines.push(`- [${check}] **[${badge}] [${issue.size}]** ${issue.title}`);
  if (issue.description.trim()) {
    lines.push(`  > ${issue.description.trim().replace(/\n/g, '\n  > ')}`);
  }
  if (issue.claudeNote?.trim()) {
    lines.push(`  - Claude: ${issue.claudeNote.trim()}`);
  }
  if (issue.screenshots.length > 0) {
    lines.push(`  - Screenshots (${issue.screenshots.length}):`);
    for (const ss of issue.screenshots) {
      // Prefer VaporFiles URL if available, fallback to dataUrl
      const url = useFileUrls && ss.fileUrl ? ss.fileUrl : ss.dataUrl;
      lines.push(`    - ${url}`);
    }
  }
  lines.push('');
  return lines.join('\n');
}

/**
 * Upload screenshots to VaporFiles and return updated issue with file URLs
 */
export async function uploadIssueScreenshots(issue: Issue): Promise<Issue> {
  const uploadedScreenshots: IssueScreenshot[] = [];

  for (const screenshot of issue.screenshots) {
    // Skip if already uploaded
    if (screenshot.fileUrl) {
      uploadedScreenshots.push(screenshot);
      continue;
    }

    try {
      const result = await vaporFilesApi.uploadBase64(
        screenshot.dataUrl,
        `issue-${issue.id}-${screenshot.id}.png`
      );
      uploadedScreenshots.push({
        ...screenshot,
        fileUrl: result.data?.url,
      });
    } catch (error) {
      console.error('Failed to upload screenshot:', error);
      // Keep original dataUrl on failure
      uploadedScreenshots.push(screenshot);
    }
  }

  return {
    ...issue,
    screenshots: uploadedScreenshots,
  };
}

// Debounced sync helper
let syncTimeout: ReturnType<typeof setTimeout> | null = null;
function debouncedSync(fn: () => Promise<void>, delay = 1000) {
  if (syncTimeout) clearTimeout(syncTimeout);
  syncTimeout = setTimeout(() => {
    fn().catch(console.error);
  }, delay);
}

export const useIssueTracker = create<IssueTrackerState>()(
  persist(
    (set, get) => ({
      issues: [],
      suggestions: '',
      isOpen: false,
      filter: 'all',
      syncing: false,
      migrated: false,

      openTracker: () => set({ isOpen: true }),
      closeTracker: () => set({ isOpen: false }),
      setFilter: (filter) => set({ filter }),

      addIssue: (partial) => {
        const issue: Issue = {
          ...partial,
          id: crypto.randomUUID(),
          screenshots: [],
          resolved: false,
          createdAt: new Date().toISOString(),
        };
        set((state) => ({ issues: [issue, ...state.issues] }));
        debouncedSync(() => get().syncToBackend());
      },

      updateIssue: (id, updates) => {
        set((state) => ({
          issues: state.issues.map((i) =>
            i.id === id ? { ...i, ...updates } : i
          ),
        }));
        debouncedSync(() => get().syncToBackend());
      },

      removeIssue: (id) => {
        set((state) => ({
          issues: state.issues.filter((i) => i.id !== id),
        }));
        debouncedSync(() => get().syncToBackend());
      },

      toggleResolved: (id) => {
        set((state) => ({
          issues: state.issues.map((i) =>
            i.id === id ? { ...i, resolved: !i.resolved } : i
          ),
        }));
        debouncedSync(() => get().syncToBackend());
      },

      reorderIssues: (fromIndex, toIndex) => {
        set((state) => {
          const next = [...state.issues];
          const [moved] = next.splice(fromIndex, 1);
          next.splice(toIndex, 0, moved);
          return { issues: next };
        });
        debouncedSync(() => get().syncToBackend());
      },

      addScreenshot: (issueId, screenshot) => {
        set((state) => ({
          issues: state.issues.map((i) =>
            i.id === issueId
              ? { ...i, screenshots: [...i.screenshots, screenshot] }
              : i
          ),
        }));
        debouncedSync(() => get().syncToBackend());
      },

      removeScreenshot: (issueId, screenshotId) => {
        set((state) => ({
          issues: state.issues.map((i) =>
            i.id === issueId
              ? {
                  ...i,
                  screenshots: i.screenshots.filter(
                    (s) => s.id !== screenshotId
                  ),
                }
              : i
          ),
        }));
        debouncedSync(() => get().syncToBackend());
      },

      setClaudeNote: (issueId, note) => {
        set((state) => ({
          issues: state.issues.map((i) =>
            i.id === issueId ? { ...i, claudeNote: note } : i
          ),
        }));
        debouncedSync(() => get().syncToBackend());
      },

      setSuggestions: (text) => {
        set({ suggestions: text });
        debouncedSync(() => get().syncToBackend());
      },

      exportMarkdown: () => {
        const { issues, suggestions } = get();
        const md = buildMarkdown(issues, suggestions);
        navigator.clipboard.writeText(md).catch(() => {});
        return md;
      },

      // Load issues from backend
      loadFromBackend: async () => {
        const VALID_TYPES = ['bug', 'error', 'feature', 'suggestion'];
        try {
          set({ syncing: true });
          const response = await issuesApi.list();

          if (response.success && response.data) {
            const sanitized = (response.data.issues || []).map((i: Issue) => ({
              ...i,
              type: VALID_TYPES.includes(i.type) ? i.type : 'bug',
            }));
            set({
              issues: sanitized,
              suggestions: response.data.suggestions || '',
              filter: (response.data.filter as IssueFilter) || 'all',
              migrated: true,
            });
          }
        } catch (error) {
          console.error('Failed to load issues from backend:', error);
        } finally {
          set({ syncing: false });
        }
      },

      // Save issues to backend
      syncToBackend: async () => {
        const { issues, suggestions, filter, syncing } = get();
        if (syncing) return; // Skip if already syncing

        try {
          set({ syncing: true });
          await issuesApi.save({
            issues,
            suggestions,
            filter,
          });
        } catch (error) {
          console.error('Failed to sync issues to backend:', error);
        } finally {
          set({ syncing: false });
        }
      },
    }),
    {
      name: 'vf-issue-tracker',
      partialize: (state) => ({
        issues: state.issues,
        suggestions: state.suggestions,
        filter: state.filter,
        migrated: state.migrated,
      }),
    }
  )
);

// Auto-load and migrate on app start
if (typeof window !== 'undefined') {
  // Load from backend on mount
  useIssueTracker.getState().loadFromBackend().then(() => {
    const current = useIssueTracker.getState();

    // Backend had data — it's the source of truth, done
    if (current.issues.length > 0) return;

    // Backend is empty — check localStorage for migration
    const localData = localStorage.getItem('vf-issue-tracker');
    if (!localData || current.migrated) return;

    try {
      const parsed = JSON.parse(localData);
      const hasData =
        parsed.state?.issues?.length > 0 || parsed.state?.suggestions?.trim();

      if (hasData) {
        const VALID_TYPES = ['bug', 'error', 'feature', 'suggestion'];
        const sanitizedIssues = (parsed.state.issues || []).map((i: Issue) => ({
          ...i,
          type: VALID_TYPES.includes(i.type) ? i.type : 'bug',
        }));
        console.log('[Issue Tracker] Migrating localStorage data to backend...');
        useIssueTracker.setState({
          issues: sanitizedIssues,
          suggestions: parsed.state.suggestions || '',
          filter: parsed.state.filter || 'all',
        });
        useIssueTracker.getState().syncToBackend().then(() => {
          console.log('[Issue Tracker] Migration complete!');
          useIssueTracker.setState({ migrated: true });
        });
      }
    } catch (error) {
      console.error('[Issue Tracker] Migration failed:', error);
    }
  });
}

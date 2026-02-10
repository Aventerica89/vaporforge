import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface IssueScreenshot {
  id: string;
  dataUrl: string;
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
}

export function buildMarkdown(issues: Issue[], suggestions: string): string {
  const lines: string[] = ['# Issue Tracker Export', ''];
  const now = new Date().toISOString().slice(0, 10);
  lines.push(`Exported: ${now}`, '');

  const open = issues.filter((i) => !i.resolved);
  const resolved = issues.filter((i) => i.resolved);

  if (open.length > 0) {
    lines.push('## Open Issues', '');
    for (const issue of open) {
      lines.push(formatIssue(issue));
    }
  }

  if (resolved.length > 0) {
    lines.push('## Resolved', '');
    for (const issue of resolved) {
      lines.push(formatIssue(issue));
    }
  }

  if (suggestions.trim()) {
    lines.push('## Claude Suggestions', '', suggestions.trim(), '');
  }

  return lines.join('\n');
}

export function formatIssue(issue: Issue): string {
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
    lines.push(`  - ${issue.screenshots.length} screenshot(s) attached`);
  }
  lines.push('');
  return lines.join('\n');
}

export const useIssueTracker = create<IssueTrackerState>()(
  persist(
    (set, get) => ({
      issues: [],
      suggestions: '',
      isOpen: false,
      filter: 'all',

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
      },

      updateIssue: (id, updates) =>
        set((state) => ({
          issues: state.issues.map((i) =>
            i.id === id ? { ...i, ...updates } : i
          ),
        })),

      removeIssue: (id) =>
        set((state) => ({
          issues: state.issues.filter((i) => i.id !== id),
        })),

      toggleResolved: (id) =>
        set((state) => ({
          issues: state.issues.map((i) =>
            i.id === id ? { ...i, resolved: !i.resolved } : i
          ),
        })),

      reorderIssues: (fromIndex, toIndex) =>
        set((state) => {
          const next = [...state.issues];
          const [moved] = next.splice(fromIndex, 1);
          next.splice(toIndex, 0, moved);
          return { issues: next };
        }),

      addScreenshot: (issueId, screenshot) =>
        set((state) => ({
          issues: state.issues.map((i) =>
            i.id === issueId
              ? { ...i, screenshots: [...i.screenshots, screenshot] }
              : i
          ),
        })),

      removeScreenshot: (issueId, screenshotId) =>
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
        })),

      setClaudeNote: (issueId, note) =>
        set((state) => ({
          issues: state.issues.map((i) =>
            i.id === issueId ? { ...i, claudeNote: note } : i
          ),
        })),

      setSuggestions: (text) => set({ suggestions: text }),

      exportMarkdown: () => {
        const { issues, suggestions } = get();
        const md = buildMarkdown(issues, suggestions);
        navigator.clipboard.writeText(md).catch(() => {});
        return md;
      },
    }),
    {
      name: 'vf-issue-tracker',
      partialize: (state) => ({
        issues: state.issues,
        suggestions: state.suggestions,
        filter: state.filter,
      }),
    }
  )
);

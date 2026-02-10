import { create } from 'zustand';
import { chatApi } from '@/lib/api';
import type { Message, MessagePart } from '@/lib/types';

export interface ReforgeChunk {
  id: string;
  userText: string;
  assistantText: string;
  heading: string;
  summary: string;
  timestamp: string;
  files: string[];
  tools: string[];
}

interface ReforgeState {
  isOpen: boolean;
  open: () => void;
  close: () => void;
  selectedSessionId: string | null;
  setSelectedSession: (id: string) => Promise<void>;
  chunks: ReforgeChunk[];
  isLoading: boolean;
  selectedChunkIds: Set<string>;
  toggleChunk: (id: string) => void;
  selectAll: () => void;
  deselectAll: () => void;
  buildContextText: (sessionName: string) => string;
}

function extractHeading(text: string): string {
  // Strip [command:...] prefix
  const stripped = text.replace(/^\[command:[^\]]*\]\s*/, '');
  const firstLine = stripped.split('\n')[0] || '';
  return firstLine.length > 60
    ? firstLine.slice(0, 57) + '...'
    : firstLine || '(empty message)';
}

function extractSummary(text: string): string {
  // Strip markdown formatting for summary
  const plain = text
    .replace(/^#+\s+/gm, '')
    .replace(/\*\*/g, '')
    .replace(/`/g, '')
    .replace(/\n/g, ' ')
    .trim();
  return plain.length > 100 ? plain.slice(0, 97) + '...' : plain;
}

function extractFilesAndTools(parts: MessagePart[] | undefined): {
  files: string[];
  tools: string[];
} {
  if (!parts) return { files: [], tools: [] };

  const files = new Set<string>();
  const tools = new Set<string>();

  for (const part of parts) {
    if (part.type === 'tool-start') {
      if (part.name) tools.add(part.name);
      const input = part.input;
      if (input) {
        // Extract file paths from common tool input fields
        const path =
          (input.file_path as string) ||
          (input.path as string) ||
          (input.filename as string);
        if (path) files.add(path);
      }
    }
  }

  return { files: [...files], tools: [...tools] };
}

function parseChunks(messages: Message[]): ReforgeChunk[] {
  const sorted = [...messages].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );

  const chunks: ReforgeChunk[] = [];
  let currentChunk: {
    userText: string;
    assistantTexts: string[];
    timestamp: string;
    files: string[];
    tools: string[];
  } | null = null;

  for (const msg of sorted) {
    if (msg.role === 'user') {
      // Finalize previous chunk
      if (currentChunk) {
        const assistantText = currentChunk.assistantTexts.join('\n\n');
        chunks.push({
          id: `chunk-${chunks.length}`,
          userText: currentChunk.userText,
          assistantText,
          heading: extractHeading(currentChunk.userText),
          summary: extractSummary(assistantText),
          timestamp: currentChunk.timestamp,
          files: currentChunk.files,
          tools: currentChunk.tools,
        });
      }
      // Start new chunk
      currentChunk = {
        userText: msg.content,
        assistantTexts: [],
        timestamp: msg.timestamp,
        files: [],
        tools: [],
      };
    } else if (msg.role === 'assistant' && currentChunk) {
      currentChunk.assistantTexts.push(msg.content);
      const { files, tools } = extractFilesAndTools(msg.parts);
      currentChunk.files.push(...files);
      currentChunk.tools.push(...tools);
    }
  }

  // Finalize last chunk
  if (currentChunk) {
    const assistantText = currentChunk.assistantTexts.join('\n\n');
    chunks.push({
      id: `chunk-${chunks.length}`,
      userText: currentChunk.userText,
      assistantText,
      heading: extractHeading(currentChunk.userText),
      summary: extractSummary(assistantText),
      timestamp: currentChunk.timestamp,
      files: [...new Set(currentChunk.files)],
      tools: [...new Set(currentChunk.tools)],
    });
  }

  return chunks;
}

export const useReforge = create<ReforgeState>((set, get) => ({
  isOpen: false,
  open: () => set({ isOpen: true }),
  close: () =>
    set({
      isOpen: false,
      selectedChunkIds: new Set(),
    }),
  selectedSessionId: null,
  chunks: [],
  isLoading: false,
  selectedChunkIds: new Set(),

  setSelectedSession: async (id: string) => {
    set({ selectedSessionId: id, isLoading: true, chunks: [], selectedChunkIds: new Set() });
    try {
      const result = await chatApi.history(id);
      if (result.success && result.data) {
        set({ chunks: parseChunks(result.data), isLoading: false });
      } else {
        set({ chunks: [], isLoading: false });
      }
    } catch {
      set({ chunks: [], isLoading: false });
    }
  },

  toggleChunk: (id: string) => {
    const current = get().selectedChunkIds;
    const next = new Set(current);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    set({ selectedChunkIds: next });
  },

  selectAll: () => {
    const allIds = new Set(get().chunks.map((c) => c.id));
    set({ selectedChunkIds: allIds });
  },

  deselectAll: () => {
    set({ selectedChunkIds: new Set() });
  },

  buildContextText: (sessionName: string) => {
    const { chunks, selectedChunkIds } = get();
    const selected = chunks.filter((c) => selectedChunkIds.has(c.id));
    if (selected.length === 0) return '';

    const date = new Date().toLocaleDateString();
    const header = `[Reforge Context — Session: "${sessionName}" | ${date}]`;

    const body = selected
      .map((chunk, i) => {
        const lines = [`### Chunk ${i + 1} — ${chunk.heading}`];
        lines.push(`**User:** ${chunk.userText}`);
        lines.push(`**Claude:** ${chunk.assistantText}`);
        if (chunk.files.length > 0) {
          lines.push(`**Files:** ${chunk.files.join(', ')}`);
        }
        return lines.join('\n');
      })
      .join('\n\n---\n');

    return `${header}\n\n${body}`;
  },
}));

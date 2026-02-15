import { embedMany, cosineSimilarity } from 'ai';
import type { EmbeddingModel } from 'ai';
import type { SandboxManager } from '../sandbox';

/* ── Types ────────────────────────────────────── */

export interface EmbeddingEntry {
  path: string;
  contentHash: string;
  embedding: number[];
  snippet: string;
  language: string;
  size: number;
}

export interface EmbeddingsIndex {
  sessionId: string;
  userId: string;
  createdAt: string;
  updatedAt: string;
  model: string;
  dimensions: number;
  fileCount: number;
  entries: EmbeddingEntry[];
}

export interface SemanticSearchResult {
  path: string;
  score: number;
  snippet: string;
  language: string;
}

/* ── Constants ────────────────────────────────── */

const SKIP_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', 'coverage',
  '__pycache__', '.next', '.cache', '.wrangler', 'vendor',
  'target', '.turbo', '.svelte-kit', '.nuxt', '.output',
]);

const SKIP_EXTS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.svg', '.ico', '.webp',
  '.woff', '.woff2', '.ttf', '.eot', '.otf',
  '.mp3', '.mp4', '.wav', '.ogg', '.webm',
  '.zip', '.tar', '.gz', '.bz2', '.7z', '.rar',
  '.pdf', '.doc', '.docx', '.xls', '.xlsx',
  '.pyc', '.pyo', '.class', '.o', '.so', '.dylib',
  '.lock', '.map', '.min.js', '.min.css',
  '.bin', '.exe', '.dll', '.wasm',
]);

const MAX_FILES = 500;
const MAX_FILE_SIZE = 100 * 1024; // 100KB
const TRUNCATE_AT = 4096;         // First 4KB
const EMBED_BATCH_SIZE = 50;
const EMBED_MAX_PARALLEL = 2;
const MODEL_NAME = 'text-embedding-004';
const DIMENSIONS = 768;
const INDEX_TTL = 7 * 24 * 60 * 60; // 7 days
const LOCK_TTL = 60;                 // 60 seconds

/* ── KV key helpers ───────────────────────────── */

export function indexKey(userId: string, sessionId: string): string {
  return `embeddings-index:${userId}:${sessionId}`;
}

function lockKey(userId: string, sessionId: string): string {
  return `embeddings-indexing:${userId}:${sessionId}`;
}

/* ── File discovery ───────────────────────────── */

function shouldSkipPath(filePath: string): boolean {
  const parts = filePath.split('/');
  for (const part of parts) {
    if (SKIP_DIRS.has(part)) return true;
  }
  const ext = filePath.slice(filePath.lastIndexOf('.'));
  return SKIP_EXTS.has(ext.toLowerCase());
}

export async function discoverIndexableFiles(
  sandboxManager: SandboxManager,
  sessionId: string
): Promise<string[]> {
  const result = await sandboxManager.execInSandbox(
    sessionId,
    'find /workspace -type f -size -100k 2>/dev/null | head -2000',
    { timeout: 15000 }
  );

  if (!result.stdout) return [];

  const paths = result.stdout
    .split('\n')
    .map((p) => p.trim())
    .filter((p) => p.length > 0 && !shouldSkipPath(p));

  return paths.slice(0, MAX_FILES);
}

/* ── Content hashing ──────────────────────────── */

async function hashContent(text: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

function getLanguage(path: string): string {
  const ext = path.slice(path.lastIndexOf('.') + 1).toLowerCase();
  return ext || 'unknown';
}

/* ── Index building ───────────────────────────── */

export async function buildEmbeddingsIndex(
  sandboxManager: SandboxManager,
  sessionId: string,
  userId: string,
  embeddingModel: EmbeddingModel,
  kv: KVNamespace
): Promise<EmbeddingsIndex> {
  // Acquire lock
  const lock = lockKey(userId, sessionId);
  const existing = await kv.get(lock);
  if (existing) {
    throw new Error('Indexing already in progress');
  }
  await kv.put(lock, '1', { expirationTtl: LOCK_TTL });

  try {
    const files = await discoverIndexableFiles(sandboxManager, sessionId);
    if (files.length === 0) {
      const emptyIndex: EmbeddingsIndex = {
        sessionId,
        userId,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        model: MODEL_NAME,
        dimensions: DIMENSIONS,
        fileCount: 0,
        entries: [],
      };
      await kv.put(indexKey(userId, sessionId), JSON.stringify(emptyIndex), {
        expirationTtl: INDEX_TTL,
      });
      return emptyIndex;
    }

    // Read files concurrently (batches of 20)
    const fileContents: Array<{ path: string; content: string }> = [];
    const readBatchSize = 20;

    for (let i = 0; i < files.length; i += readBatchSize) {
      const batch = files.slice(i, i + readBatchSize);
      const results = await Promise.allSettled(
        batch.map(async (path) => {
          const content = await sandboxManager.readFile(sessionId, path);
          if (!content || content.length === 0) return null;
          const truncated = content.length > TRUNCATE_AT
            ? content.slice(0, TRUNCATE_AT)
            : content;
          return { path, content: truncated };
        })
      );

      for (const r of results) {
        if (r.status === 'fulfilled' && r.value) {
          fileContents.push(r.value);
        }
      }
    }

    if (fileContents.length === 0) {
      const emptyIndex: EmbeddingsIndex = {
        sessionId,
        userId,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        model: MODEL_NAME,
        dimensions: DIMENSIONS,
        fileCount: 0,
        entries: [],
      };
      await kv.put(indexKey(userId, sessionId), JSON.stringify(emptyIndex), {
        expirationTtl: INDEX_TTL,
      });
      return emptyIndex;
    }

    // Generate embeddings in batches
    const entries: EmbeddingEntry[] = [];

    for (let i = 0; i < fileContents.length; i += EMBED_BATCH_SIZE) {
      const batch = fileContents.slice(i, i + EMBED_BATCH_SIZE);
      const values = batch.map((f) => f.content);

      const { embeddings } = await embedMany({
        model: embeddingModel,
        values,
        maxParallelCalls: EMBED_MAX_PARALLEL,
      });

      for (let j = 0; j < batch.length; j++) {
        const file = batch[j];
        const contentHash = await hashContent(file.content);
        entries.push({
          path: file.path,
          contentHash,
          embedding: embeddings[j],
          snippet: file.content.slice(0, 200),
          language: getLanguage(file.path),
          size: file.content.length,
        });
      }
    }

    const now = new Date().toISOString();
    const index: EmbeddingsIndex = {
      sessionId,
      userId,
      createdAt: now,
      updatedAt: now,
      model: MODEL_NAME,
      dimensions: DIMENSIONS,
      fileCount: entries.length,
      entries,
    };

    await kv.put(indexKey(userId, sessionId), JSON.stringify(index), {
      expirationTtl: INDEX_TTL,
    });

    return index;
  } finally {
    await kv.delete(lock);
  }
}

/* ── Semantic search ──────────────────────────── */

export function semanticSearch(
  queryEmbedding: number[],
  index: EmbeddingsIndex,
  topK: number
): SemanticSearchResult[] {
  if (index.entries.length === 0) return [];

  const scored = index.entries.map((entry) => ({
    path: entry.path,
    score: cosineSimilarity(queryEmbedding, entry.embedding),
    snippet: entry.snippet,
    language: entry.language,
  }));

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, topK);
}

/* ── Helper: search with auto-embed query ─────── */

export async function searchEmbeddings(
  kv: KVNamespace,
  userId: string,
  sessionId: string,
  query: string,
  embeddingModel: EmbeddingModel,
  topK: number = 5
): Promise<SemanticSearchResult[] | null> {
  const raw = await kv.get(indexKey(userId, sessionId));
  if (!raw) return null;

  let index: EmbeddingsIndex;
  try {
    index = JSON.parse(raw);
  } catch {
    return null;
  }

  if (index.entries.length === 0) return [];

  // Embed the query
  const { embeddings } = await embedMany({
    model: embeddingModel,
    values: [query],
  });

  return semanticSearch(embeddings[0], index, topK);
}

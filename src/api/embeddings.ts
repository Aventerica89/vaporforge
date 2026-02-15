import { Hono } from 'hono';
import { z } from 'zod';
import type { User, ApiResponse } from '../types';
import type { SandboxManager } from '../sandbox';
import {
  getProviderCredentials,
  createEmbeddingModel,
} from '../services/ai-provider-factory';
import {
  buildEmbeddingsIndex,
  searchEmbeddings as searchEmbeddingsService,
  indexKey,
  type EmbeddingsIndex,
  type SemanticSearchResult,
} from '../services/embeddings';

type Variables = {
  user: User;
  sandboxManager: SandboxManager;
};

export const embeddingsRoutes = new Hono<{
  Bindings: Env;
  Variables: Variables;
}>();

/* ── POST /index — Build embeddings index for a session ──── */

const IndexRequestSchema = z.object({
  sessionId: z.string().min(1).max(100),
});

embeddingsRoutes.post('/index', async (c) => {
  const user = c.get('user');
  const sandboxManager = c.get('sandboxManager');

  const body = await c.req.json();
  const parsed = IndexRequestSchema.safeParse(body);
  if (!parsed.success) {
    return c.json<ApiResponse<never>>(
      { success: false, error: parsed.error.issues[0]?.message || 'Invalid input' },
      400
    );
  }

  const { sessionId } = parsed.data;

  const creds = await getProviderCredentials(
    c.env.SESSIONS_KV,
    user.id,
    user.claudeToken
  );
  const embeddingModel = createEmbeddingModel(creds);
  if (!embeddingModel) {
    return c.json<ApiResponse<never>>(
      { success: false, error: 'Gemini API key required for embeddings. Add one in Settings > AI Providers.' },
      400
    );
  }

  try {
    const t0 = Date.now();
    const index = await buildEmbeddingsIndex(
      sandboxManager,
      sessionId,
      user.id,
      embeddingModel,
      c.env.SESSIONS_KV
    );

    return c.json<ApiResponse<{
      fileCount: number;
      duration: number;
      model: string;
    }>>({
      success: true,
      data: {
        fileCount: index.fileCount,
        duration: Date.now() - t0,
        model: index.model,
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Indexing failed';
    return c.json<ApiResponse<never>>({ success: false, error: msg }, 500);
  }
});

/* ── GET /status — Check indexing status for a session ──── */

embeddingsRoutes.get('/status', async (c) => {
  const user = c.get('user');
  const sessionId = c.req.query('sessionId');

  if (!sessionId) {
    return c.json<ApiResponse<never>>(
      { success: false, error: 'sessionId query param required' },
      400
    );
  }

  const raw = await c.env.SESSIONS_KV.get(indexKey(user.id, sessionId));
  if (!raw) {
    // Check if indexing is in progress
    const isIndexing = await c.env.SESSIONS_KV.get(
      `embeddings-indexing:${user.id}:${sessionId}`
    );
    return c.json<ApiResponse<{
      indexed: boolean;
      fileCount: number;
      lastIndexedAt: string | null;
      indexing: boolean;
    }>>({
      success: true,
      data: {
        indexed: false,
        fileCount: 0,
        lastIndexedAt: null,
        indexing: !!isIndexing,
      },
    });
  }

  let index: EmbeddingsIndex;
  try {
    index = JSON.parse(raw);
  } catch {
    return c.json<ApiResponse<never>>(
      { success: false, error: 'Corrupt index data' },
      500
    );
  }

  return c.json<ApiResponse<{
    indexed: boolean;
    fileCount: number;
    lastIndexedAt: string | null;
    indexing: boolean;
  }>>({
    success: true,
    data: {
      indexed: true,
      fileCount: index.fileCount,
      lastIndexedAt: index.updatedAt,
      indexing: false,
    },
  });
});

/* ── POST /search — Semantic search against the index ──── */

const SearchRequestSchema = z.object({
  sessionId: z.string().min(1).max(100),
  query: z.string().min(1).max(1000),
  topK: z.number().min(1).max(20).optional().default(5),
});

embeddingsRoutes.post('/search', async (c) => {
  const user = c.get('user');

  const body = await c.req.json();
  const parsed = SearchRequestSchema.safeParse(body);
  if (!parsed.success) {
    return c.json<ApiResponse<never>>(
      { success: false, error: parsed.error.issues[0]?.message || 'Invalid input' },
      400
    );
  }

  const { sessionId, query, topK } = parsed.data;

  const creds = await getProviderCredentials(
    c.env.SESSIONS_KV,
    user.id,
    user.claudeToken
  );
  const embeddingModel = createEmbeddingModel(creds);
  if (!embeddingModel) {
    return c.json<ApiResponse<never>>(
      { success: false, error: 'Gemini API key required for semantic search.' },
      400
    );
  }

  try {
    const t0 = Date.now();
    const results = await searchEmbeddingsService(
      c.env.SESSIONS_KV,
      user.id,
      sessionId,
      query,
      embeddingModel,
      topK
    );

    if (!results) {
      return c.json<ApiResponse<{
        results: SemanticSearchResult[];
        queryTime: number;
      }>>({
        success: true,
        data: { results: [], queryTime: Date.now() - t0 },
      });
    }

    return c.json<ApiResponse<{
      results: SemanticSearchResult[];
      queryTime: number;
    }>>({
      success: true,
      data: { results, queryTime: Date.now() - t0 },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Search failed';
    return c.json<ApiResponse<never>>({ success: false, error: msg }, 500);
  }
});

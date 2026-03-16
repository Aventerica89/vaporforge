import type { KVNamespace } from '@cloudflare/workers-types';

export async function assertSessionOwnership(
  kv: KVNamespace,
  sessionId: string,
  userId: string
): Promise<void> {
  const session = await kv.get(`session:${sessionId}`, 'json') as { userId?: string } | null;
  if (!session) {
    throw new Response(JSON.stringify({ success: false, error: 'Session not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  if (session.userId !== userId) {
    throw new Response(JSON.stringify({ success: false, error: 'Forbidden' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

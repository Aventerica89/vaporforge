// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// approveToolUse does not exist yet — this test defines the expected contract.
// RED: these tests should fail until approveToolUse is implemented in api.ts.

describe('approveToolUse', () => {
  beforeEach(() => {
    localStorage.setItem('session_token', 'test-jwt-token');
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    localStorage.clear();
    vi.unstubAllGlobals();
  });

  it('POSTs to /api/v15/approve with correct body on approval', async () => {
    const { approveToolUse } = await import('@/lib/api');

    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: true }), { status: 200 })
    );

    await approveToolUse('session-123', 'approval-abc', true);

    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/v15/approve'),
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer test-jwt-token',
        }),
        body: JSON.stringify({ sessionId: 'session-123', approvalId: 'approval-abc', approved: true }),
      })
    );
  });

  it('POSTs approved: false on denial', async () => {
    const { approveToolUse } = await import('@/lib/api');

    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: true }), { status: 200 })
    );

    await approveToolUse('session-123', 'approval-abc', false);

    const callBody = JSON.parse(
      (fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body
    );
    expect(callBody.approved).toBe(false);
  });

  it('throws on non-2xx response', async () => {
    const { approveToolUse } = await import('@/lib/api');

    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      new Response('Not Found', { status: 404 })
    );

    await expect(approveToolUse('session-123', 'approval-abc', true)).rejects.toThrow();
  });
});

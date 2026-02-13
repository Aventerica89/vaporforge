import { describe, it, expect, beforeEach } from 'vitest';
import { AuthService } from './auth';

// Replicate the private hashToken logic so we can predict userIds in tests
async function hashToken(token: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(token);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

async function userIdFor(token: string): Promise<string> {
  const h = await hashToken(token);
  return `user_${h.slice(0, 16)}`;
}

/** Minimal KVNamespace mock backed by a plain Map */
function createMockKV(): KVNamespace & { _store: Map<string, string> } {
  const store = new Map<string, string>();
  return {
    _store: store,
    get: (async (key: string, opts?: any) => {
      const val = store.get(key) ?? null;
      if (val === null) return null;
      if (opts === 'json' || (opts && typeof opts === 'object' && opts.type === 'json')) {
        return JSON.parse(val);
      }
      return val;
    }) as any,
    put: (async (key: string, value: string) => {
      store.set(key, value);
    }) as any,
    delete: (async (key: string) => {
      store.delete(key);
    }) as any,
    list: (async () => ({ keys: [], list_complete: true, cacheStatus: null })) as any,
    getWithMetadata: (async () => ({ value: null, metadata: null, cacheStatus: null })) as any,
  };
}

const TEST_SECRET = 'test-jwt-secret';
const TOKEN_OLD = 'sk-ant-oat01-old-token-aaaaaa';
const TOKEN_NEW = 'sk-ant-oat01-new-token-bbbbbb';

describe('AuthService.getOrCreateUser', () => {
  let kv: ReturnType<typeof createMockKV>;
  let auth: AuthService;

  beforeEach(() => {
    kv = createMockKV();
    auth = new AuthService(kv as unknown as KVNamespace, TEST_SECRET);
  });

  it('resolves user-alias when token hash has a forward pointer', async () => {
    const oldUserId = await userIdFor(TOKEN_OLD);
    const newUserId = await userIdFor(TOKEN_NEW);

    // Simulate: user originally logged in with TOKEN_OLD
    const oldUser = {
      id: oldUserId,
      email: `${oldUserId}@claude-cloud.local`,
      claudeToken: TOKEN_OLD,
      createdAt: new Date().toISOString(),
    };
    kv._store.set(`user:${oldUserId}`, JSON.stringify(oldUser));

    // Simulate: a previous rotation created a forward alias
    kv._store.set(`user-alias:${newUserId}`, oldUserId);

    // Login with TOKEN_NEW, NO previousUserId hint (e.g. localStorage cleared)
    const result = await auth.getOrCreateUser(TOKEN_NEW);

    expect(result).not.toBeNull();
    expect(result!.id).toBe(oldUserId); // Should resolve to old user, not create new
    expect(result!.claudeToken).toBe(TOKEN_NEW); // Token should be updated
  });

  it('falls through to create new user when no alias and no hint exist', async () => {
    const token = 'sk-ant-oat01-brand-new-token';
    const expectedId = await userIdFor(token);

    const result = await auth.getOrCreateUser(token);

    expect(result).not.toBeNull();
    expect(result!.id).toBe(expectedId);
    expect(result!.claudeToken).toBe(token);
    // Should have been persisted
    expect(kv._store.has(`user:${expectedId}`)).toBe(true);
  });

  it('prefers direct user match over alias', async () => {
    const userId = await userIdFor(TOKEN_NEW);

    // Direct user record exists for this token
    const directUser = {
      id: userId,
      email: `${userId}@claude-cloud.local`,
      claudeToken: TOKEN_NEW,
      createdAt: new Date().toISOString(),
    };
    kv._store.set(`user:${userId}`, JSON.stringify(directUser));

    // Also an alias pointing elsewhere (should be ignored)
    kv._store.set(`user-alias:${userId}`, 'user_shouldnotbeused');

    const result = await auth.getOrCreateUser(TOKEN_NEW);

    expect(result).not.toBeNull();
    expect(result!.id).toBe(userId); // Direct match wins
  });

  it('previousUserId hint still works and takes priority over alias', async () => {
    const newUserId = await userIdFor(TOKEN_NEW);
    const hintUserId = 'user_from_hint_1234';

    // User record under the hint userId
    const hintUser = {
      id: hintUserId,
      email: `${hintUserId}@claude-cloud.local`,
      claudeToken: TOKEN_OLD,
      createdAt: new Date().toISOString(),
    };
    kv._store.set(`user:${hintUserId}`, JSON.stringify(hintUser));

    // Alias pointing somewhere else (should be ignored because hint takes priority)
    kv._store.set(`user-alias:${newUserId}`, 'user_other_alias');
    kv._store.set(
      `user:user_other_alias`,
      JSON.stringify({
        id: 'user_other_alias',
        email: 'other@claude-cloud.local',
        claudeToken: 'sk-ant-oat01-other',
        createdAt: new Date().toISOString(),
      })
    );

    const result = await auth.getOrCreateUser(TOKEN_NEW, hintUserId);

    expect(result).not.toBeNull();
    expect(result!.id).toBe(hintUserId); // Hint wins over alias
    expect(result!.claudeToken).toBe(TOKEN_NEW); // Token updated

    // Forward alias should point to hint user now
    expect(kv._store.get(`user-alias:${newUserId}`)).toBe(hintUserId);
  });

  it('creates forward alias when falling back to alias-resolved user', async () => {
    const oldUserId = await userIdFor(TOKEN_OLD);
    const newUserId = await userIdFor(TOKEN_NEW);

    const oldUser = {
      id: oldUserId,
      email: `${oldUserId}@claude-cloud.local`,
      claudeToken: TOKEN_OLD,
      createdAt: new Date().toISOString(),
    };
    kv._store.set(`user:${oldUserId}`, JSON.stringify(oldUser));
    kv._store.set(`user-alias:${newUserId}`, oldUserId);

    await auth.getOrCreateUser(TOKEN_NEW);

    // The alias should still exist (or be refreshed) for future lookups
    expect(kv._store.get(`user-alias:${newUserId}`)).toBe(oldUserId);
  });
});

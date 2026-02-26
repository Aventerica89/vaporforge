import { describe, it, expect, beforeAll } from 'vitest';
import { signExecutionToken, verifyExecutionToken } from './jwt';

let testSecret: string;

beforeAll(async () => {
  const key = new Uint8Array(32);
  crypto.getRandomValues(key);
  testSecret = btoa(String.fromCharCode(...key));
});

describe('signExecutionToken', () => {
  it('produces a 3-part JWT string', async () => {
    const token = await signExecutionToken('exec-1', 'session-1', testSecret);
    expect(token.split('.')).toHaveLength(3);
  });

  it('embeds executionId and sessionId in payload', async () => {
    const token = await signExecutionToken('exec-1', 'session-1', testSecret);
    const payload = JSON.parse(atob(token.split('.')[1]));
    expect(payload.executionId).toBe('exec-1');
    expect(payload.sessionId).toBe('session-1');
  });

  it('sets exp claim ~5 minutes in the future', async () => {
    const before = Math.floor(Date.now() / 1000);
    const token = await signExecutionToken('exec-1', 'session-1', testSecret);
    const after = Math.floor(Date.now() / 1000);
    const payload = JSON.parse(atob(token.split('.')[1]));
    expect(payload.exp).toBeGreaterThanOrEqual(before + 298);
    expect(payload.exp).toBeLessThanOrEqual(after + 302);
  });
});

describe('verifyExecutionToken', () => {
  it('returns payload for a valid token', async () => {
    const token = await signExecutionToken('exec-1', 'session-1', testSecret);
    const result = await verifyExecutionToken(token, testSecret);
    expect(result).not.toBeNull();
    expect(result!.executionId).toBe('exec-1');
    expect(result!.sessionId).toBe('session-1');
  });

  it('returns null for a tampered payload', async () => {
    const token = await signExecutionToken('exec-1', 'session-1', testSecret);
    const parts = token.split('.');
    const payload = JSON.parse(atob(parts[1]));
    payload.sessionId = 'hacked-session';
    parts[1] = btoa(JSON.stringify(payload));
    const tampered = parts.join('.');
    const result = await verifyExecutionToken(tampered, testSecret);
    expect(result).toBeNull();
  });

  it('returns null for an expired token', async () => {
    const token = await signExecutionToken('exec-1', 'session-1', testSecret, -600);
    const result = await verifyExecutionToken(token, testSecret);
    expect(result).toBeNull();
  });

  it('returns null for wrong secret', async () => {
    const token = await signExecutionToken('exec-1', 'session-1', testSecret);
    const result = await verifyExecutionToken(token, 'wrong-secret');
    expect(result).toBeNull();
  });

  it('returns null for malformed tokens', async () => {
    expect(await verifyExecutionToken('not.a.jwt', testSecret)).toBeNull();
    expect(await verifyExecutionToken('', testSecret)).toBeNull();
    expect(await verifyExecutionToken('abc', testSecret)).toBeNull();
  });
});

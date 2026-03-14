import { describe, it, expect } from 'vitest';
import { McpServerConfigSchema } from '../types';
import {
  generateCodeVerifier, computeCodeChallenge, generateState, buildCredentialsFile,
} from '../api/mcp-oauth';

describe('McpServerConfig OAuth fields', () => {
  it('accepts requiresOAuth and oauthStatus', () => {
    const result = McpServerConfigSchema.safeParse({
      name: 'atlassian',
      transport: 'http',
      url: 'https://mcp.atlassian.com',
      enabled: true,
      addedAt: new Date().toISOString(),
      requiresOAuth: true,
      oauthStatus: 'pending',
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.oauthStatus).toBe('pending');
  });

  it('accepts oauthStatus values: none, pending, authorized, expired', () => {
    for (const status of ['none', 'pending', 'authorized', 'expired'] as const) {
      const result = McpServerConfigSchema.safeParse({
        name: 'test', transport: 'http', url: 'https://example.com',
        enabled: true, addedAt: new Date().toISOString(),
        oauthStatus: status,
      });
      expect(result.success).toBe(true);
    }
  });

  it('rejects an invalid oauthStatus value', () => {
    const result = McpServerConfigSchema.safeParse({
      name: 'test',
      transport: 'http',
      url: 'https://example.com',
      enabled: true,
      addedAt: new Date().toISOString(),
      oauthStatus: 'connected',
    });
    expect(result.success).toBe(false);
  });
});

describe('PKCE utilities', () => {
  it('generateCodeVerifier returns 43+ char base64url string', () => {
    const v = generateCodeVerifier();
    expect(v.length).toBeGreaterThanOrEqual(43);
    expect(v).toMatch(/^[A-Za-z0-9\-_]+$/);
  });

  it('computeCodeChallenge returns valid base64url', async () => {
    const challenge = await computeCodeChallenge(generateCodeVerifier());
    expect(challenge).toMatch(/^[A-Za-z0-9\-_]+$/);
  });

  it('generateState returns 64-char hex string', () => {
    expect(generateState()).toMatch(/^[a-f0-9]{64}$/);
  });
});

describe('buildCredentialsFile', () => {
  it('builds JSON with mcpOAuth keyed by serverName', () => {
    const file = buildCredentialsFile([{
      serverName: 'atlassian',
      accessToken: 'tok',
      expiresAt: Date.now() + 3600000,
      clientId: 'vf',
      tokenType: 'Bearer',
      discoveryState: {
        authorizationServerMetadata: {
          token_endpoint: 'https://auth.atlassian.com/token',
        },
      },
    }]);
    const parsed = JSON.parse(file);
    expect(parsed.mcpOAuth['atlassian'].accessToken).toBe('tok');
  });
});

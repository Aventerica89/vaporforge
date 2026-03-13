import { describe, it, expect } from 'vitest';
import { McpServerConfigSchema } from '../types';

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
});

/**
 * Shared helper to assemble SandboxConfig from KV for session wake/resume.
 * Used by both the session resume endpoint and the SDK stream endpoint
 * to re-inject config after a container recycle.
 */
import type { SandboxConfig } from './sandbox';
import { collectMcpConfig, hasRelayServers, collectCredentialFiles } from './api/mcp';
import { collectPluginConfigs } from './api/plugins';
import { collectUserConfigs } from './api/config';
import { getVfRules } from './api/user';
import { collectGeminiMcpConfig } from './api/ai-providers';

export async function assembleSandboxConfig(
  kv: KVNamespace,
  userId: string
): Promise<SandboxConfig> {
  const [claudeMd, mcpServers, pluginConfigs, userConfigs, vfRules, geminiMcp, credentialFiles] =
    await Promise.all([
      kv.get(`user-config:${userId}:claude-md`),
      collectMcpConfig(kv, userId),
      collectPluginConfigs(kv, userId),
      collectUserConfigs(kv, userId),
      getVfRules(kv, userId),
      collectGeminiMcpConfig(kv, userId),
      collectCredentialFiles(kv, userId),
    ]);

  return {
    claudeMd: claudeMd || undefined,
    mcpServers,
    pluginConfigs,
    userConfigs,
    vfRules,
    injectGeminiAgent: !!geminiMcp,
    startRelayProxy: await hasRelayServers(kv, userId),
    credentialFiles,
  };
}

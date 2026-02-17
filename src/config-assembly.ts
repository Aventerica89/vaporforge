/**
 * Shared helper to assemble SandboxConfig from KV for session wake/resume.
 * Used by both the session resume endpoint and the SDK stream endpoint
 * to re-inject config after a container recycle.
 */
import type { SandboxConfig } from './sandbox';
import { collectMcpConfig, hasRelayServers, collectCredentialFiles } from './api/mcp';
import { collectPluginConfigs } from './api/plugins';
import { collectUserConfigs } from './api/config';
import { getVfRules, getAutoContextPref } from './api/user';
import { collectGeminiMcpConfig } from './api/ai-providers';
import { configHash } from './lib/config-hash';

export interface ConfigWithHashes {
  config: SandboxConfig;
  hashes: { mcpConfigHash: string; credFilesHash: string };
}

export async function assembleSandboxConfig(
  kv: KVNamespace,
  userId: string
): Promise<SandboxConfig> {
  const [claudeMd, mcpServers, pluginConfigs, userConfigs, vfRules, geminiMcp, credentialFiles, autoContext] =
    await Promise.all([
      kv.get(`user-config:${userId}:claude-md`),
      collectMcpConfig(kv, userId),
      collectPluginConfigs(kv, userId),
      collectUserConfigs(kv, userId),
      getVfRules(kv, userId),
      collectGeminiMcpConfig(kv, userId),
      collectCredentialFiles(kv, userId),
      getAutoContextPref(kv, userId),
    ]);

  return {
    claudeMd: claudeMd || undefined,
    mcpServers,
    pluginConfigs,
    userConfigs,
    vfRules,
    injectGeminiAgent: !!geminiMcp,
    geminiMcpServers: geminiMcp || undefined,
    startRelayProxy: await hasRelayServers(kv, userId),
    credentialFiles,
    autoContext,
  };
}

export async function assembleSandboxConfigWithHashes(
  kv: KVNamespace,
  userId: string
): Promise<ConfigWithHashes> {
  const config = await assembleSandboxConfig(kv, userId);

  const mergedMcp = {
    ...(config.mcpServers || {}),
    ...(config.pluginConfigs?.mcpServers || {}),
    ...(config.geminiMcpServers || {}),
  };

  const [mcpConfigHash, credFilesHash] = await Promise.all([
    configHash(mergedMcp as Record<string, unknown>),
    configHash(config.credentialFiles as unknown as Record<string, unknown>),
  ]);

  return { config, hashes: { mcpConfigHash, credFilesHash } };
}

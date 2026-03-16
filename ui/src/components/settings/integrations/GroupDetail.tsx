import type { Plugin } from '@/lib/types';

interface GroupDetailProps {
  groupName: string;
  plugins: Plugin[];
}

export function GroupDetail({ groupName, plugins }: GroupDetailProps) {
  const repoUrl = plugins[0]?.repoUrl;
  const enabledCount = plugins.filter((p) => p.enabled).length;

  // Collect unique filesystem path grants from all plugins in the group
  const allPaths = new Set<string>();
  for (const p of plugins) {
    if (p.repoUrl && (p.rules.length > 0 || p.agents.length > 0)) {
      allPaths.add(p.repoUrl);
    }
  }

  const componentCounts = plugins.reduce(
    (acc, p) => ({
      agents: acc.agents + p.agents.length,
      commands: acc.commands + p.commands.length,
      rules: acc.rules + p.rules.length,
    }),
    { agents: 0, commands: 0, rules: 0 }
  );

  return (
    <div className="flex flex-1 flex-col gap-[20px] min-h-0 overflow-y-auto px-[40px] py-[32px]">
      {/* Header */}
      <div className="flex items-center gap-3">
        <span className="font-['Space_Mono'] text-[18px] font-semibold text-white">
          {groupName}
        </span>
        <span className="font-['Space_Mono'] text-[11px] text-[#8b949e]">
          {enabledCount}/{plugins.length} active
        </span>
      </div>

      {/* SCOPE section */}
      <div className="flex flex-col gap-[6px]">
        <span className="font-['Space_Mono'] text-[9px] font-bold uppercase text-[#4b535d]" style={{ letterSpacing: '1.2px' }}>
          SCOPE
        </span>
        <div className="flex gap-2">
          <span className="rounded-full border border-[#00e5ff33] bg-[#00e5ff0a] px-3 py-1 font-['Space_Mono'] text-[10px] text-[#00e5ff]">
            Global
          </span>
          <span className="rounded-full border border-[#30363d] px-3 py-1 font-['Space_Mono'] text-[10px] text-[#768390]">
            This Repo
          </span>
        </div>
        <p className="font-['Space_Mono'] text-[9px] text-[#8b949e]">
          Scope is configured per-plugin. Select a plugin to change its scope.
        </p>
      </div>

      {/* Divider */}
      <div className="h-px bg-[#21262d]" />

      {/* PERMISSIONS & SCOPES */}
      <div className="flex flex-col gap-[8px]">
        <span className="font-['Space_Mono'] text-[9px] font-bold uppercase text-[#4b535d]" style={{ letterSpacing: '1.2px' }}>
          PERMISSIONS &amp; SCOPES
        </span>
        <div className="rounded-[6px] border border-[#30363d] bg-[#161b22] px-[12px] py-[10px]">
          <div className="flex items-center gap-[10px]">
            <span className="font-['Space_Mono'] text-[11px] text-[#8b949e]">Components</span>
            <div className="flex gap-2">
              {componentCounts.agents > 0 && (
                <span className="rounded-[3px] border border-[#a371f733] bg-[#a371f70a] px-[8px] py-[3px] font-['Space_Mono'] text-[9px] text-[#a371f7]">
                  {componentCounts.agents} agent{componentCounts.agents !== 1 ? 's' : ''}
                </span>
              )}
              {componentCounts.commands > 0 && (
                <span className="rounded-[3px] border border-[#00e5ff33] bg-[#00e5ff0a] px-[8px] py-[3px] font-['Space_Mono'] text-[9px] text-[#00e5ff]">
                  {componentCounts.commands} cmd{componentCounts.commands !== 1 ? 's' : ''}
                </span>
              )}
              {componentCounts.rules > 0 && (
                <span className="rounded-[3px] border border-[#f8514933] bg-[#f851490a] px-[8px] py-[3px] font-['Space_Mono'] text-[9px] text-[#f85149]">
                  {componentCounts.rules} rule{componentCounts.rules !== 1 ? 's' : ''}
                </span>
              )}
              {componentCounts.agents === 0 && componentCounts.commands === 0 && componentCounts.rules === 0 && (
                <span className="font-['Space_Mono'] text-[11px] text-[#768390]/40">No components</span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Divider */}
      <div className="h-px bg-[#21262d]" />

      {/* GitHub info */}
      {repoUrl && (
        <div className="flex flex-col gap-[8px]">
          <span className="font-['Space_Mono'] text-[9px] font-bold uppercase text-[#4b535d]" style={{ letterSpacing: '1.2px' }}>
            SOURCE
          </span>
          <div className="flex items-center gap-2">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#768390" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
              <path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22" />
            </svg>
            <a
              href={repoUrl.startsWith('http') ? repoUrl : `https://${repoUrl}`}
              target="_blank"
              rel="noopener noreferrer"
              className="font-['Space_Mono'] text-[10px] text-[#00e5ff] no-underline hover:underline"
            >
              {repoUrl.replace(/^https?:\/\//, '')}
            </a>
          </div>
          <p className="font-['Space_Mono'] text-[10px] leading-[1.5] text-[#768390]">
            {plugins.length} plugin{plugins.length !== 1 ? 's' : ''} from this publisher
          </p>
        </div>
      )}
    </div>
  );
}

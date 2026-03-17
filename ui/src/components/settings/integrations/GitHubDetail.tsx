import { useEffect, useState, useCallback } from 'react';
import { githubApi } from '@/lib/api';
import { toast } from '@/hooks/useToast';

interface GitHubConnection {
  connected: boolean;
  username?: string;
  avatarUrl?: string;
  connectedAt?: string;
  legacyUsername?: string | null;
}

interface Repo {
  name: string;
  full_name: string;
  html_url: string;
  description: string | null;
  stargazers_count: number;
  language: string | null;
  updated_at: string;
  fork: boolean;
  private: boolean;
}

export function GitHubDetail() {
  const [connection, setConnection] = useState<GitHubConnection | null>(null);
  const [repos, setRepos] = useState<Repo[]>([]);
  const [repoSearch, setRepoSearch] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingRepos, setIsLoadingRepos] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isDisconnecting, setIsDisconnecting] = useState(false);

  const loadConnection = useCallback(async () => {
    try {
      const res = await githubApi.getConnection();
      if (res.success && res.data) {
        setConnection(res.data);
      } else {
        setConnection({ connected: false });
      }
    } catch {
      setConnection({ connected: false });
    } finally {
      setIsLoading(false);
    }
  }, []);

  const loadRepos = useCallback(async () => {
    setIsLoadingRepos(true);
    try {
      const res = await githubApi.repos();
      if (res.success && res.data) {
        setRepos(res.data.repos ?? []);
      }
    } catch (err) {
      if (err instanceof Error && err.message.includes('expired')) {
        toast('GitHub token expired. Please reconnect.', 'error');
        setConnection({ connected: false });
      }
    } finally {
      setIsLoadingRepos(false);
    }
  }, []);

  useEffect(() => {
    loadConnection();
  }, [loadConnection]);

  useEffect(() => {
    if (connection?.connected) {
      loadRepos();
    }
  }, [connection?.connected, loadRepos]);

  const handleConnect = () => {
    // Navigate to the OAuth auth endpoint (same-window redirect)
    window.location.href = githubApi.getAuthUrl();
  };

  const handleDisconnect = async () => {
    setIsDisconnecting(true);
    try {
      await githubApi.disconnect();
      setConnection({ connected: false });
      setRepos([]);
      toast('GitHub disconnected', 'success');
    } catch {
      toast('Failed to disconnect', 'error');
    } finally {
      setIsDisconnecting(false);
    }
  };

  const handleSync = async () => {
    setIsSyncing(true);
    try {
      const res = await githubApi.sync();
      if (res.success && res.data) {
        setRepos(res.data.repos ?? []);
      }
      toast('Repos refreshed', 'success');
    } catch {
      toast('Failed to refresh repos', 'error');
    } finally {
      setIsSyncing(false);
    }
  };

  const filteredRepos = repos.filter((r) =>
    r.full_name.toLowerCase().includes(repoSearch.toLowerCase())
  );

  if (isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <span className="font-['Space_Mono'] text-[11px] text-[#8b949e] animate-pulse">Loading...</span>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col min-h-0 overflow-hidden">
      {/* Header */}
      <div className="flex h-12 shrink-0 items-center justify-between border-b border-[#21262d] bg-[#0d1117] px-5">
        <div className="flex items-center gap-3">
          <svg viewBox="0 0 16 16" width="18" height="18" fill="#cdd9e5">
            <path d="M8 0c4.42 0 8 3.58 8 8a8.013 8.013 0 0 1-5.45 7.59c-.4.08-.55-.17-.55-.38 0-.27.01-1.13.01-2.2 0-.75-.25-1.23-.54-1.48 1.78-.2 3.65-.88 3.65-3.95 0-.88-.31-1.59-.82-2.15.08-.2.36-1.02-.08-2.12 0 0-.67-.22-2.2.82-.64-.18-1.32-.27-2-.27-.68 0-1.36.09-2 .27-1.53-1.03-2.2-.82-2.2-.82-.44 1.1-.16 1.92-.08 2.12-.51.56-.82 1.28-.82 2.15 0 3.06 1.86 3.75 3.64 3.95-.23.2-.44.55-.51 1.07-.46.21-1.61.55-2.33-.66-.15-.24-.6-.83-1.23-.82-.67.01-.27.38.01.53.34.19.73.9.82 1.13.16.45.68 1.31 2.69.94 0 .67.01 1.3.01 1.49 0 .21-.15.45-.55.38A7.995 7.995 0 0 1 0 8c0-4.42 3.58-8 8-8Z" />
          </svg>
          <span className="font-['Space_Mono'] text-[12px] font-semibold uppercase tracking-[1px] text-[#cdd9e5]">
            GitHub
          </span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-5">
        {!connection?.connected ? (
          /* ── Not connected ────────────────────────────── */
          <div className="flex flex-col items-center gap-6 pt-12">
            <div className="flex flex-col items-center gap-2">
              <svg viewBox="0 0 16 16" width="40" height="40" fill="#30363d">
                <path d="M8 0c4.42 0 8 3.58 8 8a8.013 8.013 0 0 1-5.45 7.59c-.4.08-.55-.17-.55-.38 0-.27.01-1.13.01-2.2 0-.75-.25-1.23-.54-1.48 1.78-.2 3.65-.88 3.65-3.95 0-.88-.31-1.59-.82-2.15.08-.2.36-1.02-.08-2.12 0 0-.67-.22-2.2.82-.64-.18-1.32-.27-2-.27-.68 0-1.36.09-2 .27-1.53-1.03-2.2-.82-2.2-.82-.44 1.1-.16 1.92-.08 2.12-.51.56-.82 1.28-.82 2.15 0 3.06 1.86 3.75 3.64 3.95-.23.2-.44.55-.51 1.07-.46.21-1.61.55-2.33-.66-.15-.24-.6-.83-1.23-.82-.67.01-.27.38.01.53.34.19.73.9.82 1.13.16.45.68 1.31 2.69.94 0 .67.01 1.3.01 1.49 0 .21-.15.45-.55.38A7.995 7.995 0 0 1 0 8c0-4.42 3.58-8 8-8Z" />
              </svg>
              <h3 className="font-['Space_Mono'] text-[14px] font-semibold text-[#cdd9e5]">
                Connect GitHub
              </h3>
              <p className="max-w-[320px] text-center font-['Space_Mono'] text-[11px] text-[#8b949e] leading-relaxed">
                Grant VaporForge access to your repositories. The agent can clone, read, and push to connected repos.
              </p>
            </div>
            <button
              onClick={handleConnect}
              className="flex items-center gap-2 rounded-lg border border-[#30363d] bg-[#21262d] px-5 py-2.5 font-['Space_Mono'] text-[12px] font-semibold text-[#cdd9e5] transition-all hover:border-[#8b949e] hover:bg-[#30363d]"
            >
              <svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor">
                <path d="M8 0c4.42 0 8 3.58 8 8a8.013 8.013 0 0 1-5.45 7.59c-.4.08-.55-.17-.55-.38 0-.27.01-1.13.01-2.2 0-.75-.25-1.23-.54-1.48 1.78-.2 3.65-.88 3.65-3.95 0-.88-.31-1.59-.82-2.15.08-.2.36-1.02-.08-2.12 0 0-.67-.22-2.2.82-.64-.18-1.32-.27-2-.27-.68 0-1.36.09-2 .27-1.53-1.03-2.2-.82-2.2-.82-.44 1.1-.16 1.92-.08 2.12-.51.56-.82 1.28-.82 2.15 0 3.06 1.86 3.75 3.64 3.95-.23.2-.44.55-.51 1.07-.46.21-1.61.55-2.33-.66-.15-.24-.6-.83-1.23-.82-.67.01-.27.38.01.53.34.19.73.9.82 1.13.16.45.68 1.31 2.69.94 0 .67.01 1.3.01 1.49 0 .21-.15.45-.55.38A7.995 7.995 0 0 1 0 8c0-4.42 3.58-8 8-8Z" />
              </svg>
              Connect with GitHub
            </button>
          </div>
        ) : (
          /* ── Connected ────────────────────────────────── */
          <div className="flex flex-col gap-5">
            {/* Connection info */}
            <div className="flex items-center justify-between rounded-lg border border-[#21262d] bg-[#161b22] p-4">
              <div className="flex items-center gap-3">
                {connection.avatarUrl ? (
                  <img
                    src={connection.avatarUrl}
                    alt={connection.username}
                    className="h-10 w-10 rounded-full border border-[#30363d]"
                  />
                ) : (
                  <div className="flex h-10 w-10 items-center justify-center rounded-full border border-[#30363d] bg-[#21262d]">
                    <svg viewBox="0 0 16 16" width="20" height="20" fill="#8b949e">
                      <path d="M8 0c4.42 0 8 3.58 8 8a8.013 8.013 0 0 1-5.45 7.59c-.4.08-.55-.17-.55-.38 0-.27.01-1.13.01-2.2 0-.75-.25-1.23-.54-1.48 1.78-.2 3.65-.88 3.65-3.95 0-.88-.31-1.59-.82-2.15.08-.2.36-1.02-.08-2.12 0 0-.67-.22-2.2.82-.64-.18-1.32-.27-2-.27-.68 0-1.36.09-2 .27-1.53-1.03-2.2-.82-2.2-.82-.44 1.1-.16 1.92-.08 2.12-.51.56-.82 1.28-.82 2.15 0 3.06 1.86 3.75 3.64 3.95-.23.2-.44.55-.51 1.07-.46.21-1.61.55-2.33-.66-.15-.24-.6-.83-1.23-.82-.67.01-.27.38.01.53.34.19.73.9.82 1.13.16.45.68 1.31 2.69.94 0 .67.01 1.3.01 1.49 0 .21-.15.45-.55.38A7.995 7.995 0 0 1 0 8c0-4.42 3.58-8 8-8Z" />
                    </svg>
                  </div>
                )}
                <div className="flex flex-col">
                  <span className="font-['Space_Mono'] text-[13px] font-semibold text-[#cdd9e5]">
                    {connection.username}
                  </span>
                  <span className="flex items-center gap-1.5 font-['Space_Mono'] text-[10px] text-[#8b949e]">
                    <span className="inline-block h-1.5 w-1.5 rounded-full bg-green-500 shadow-[0_0_4px_theme(colors.green.500)]" />
                    Connected
                  </span>
                </div>
              </div>
              <button
                onClick={handleDisconnect}
                disabled={isDisconnecting}
                className="rounded border border-[#30363d] bg-transparent px-3 py-1.5 font-['Space_Mono'] text-[10px] text-[#f85149] transition-all hover:border-[#f85149]/40 hover:bg-[#f85149]/10 disabled:opacity-50"
              >
                {isDisconnecting ? 'Disconnecting...' : 'Disconnect'}
              </button>
            </div>

            {/* Repos section */}
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <span className="font-['Space_Mono'] text-[11px] font-semibold uppercase tracking-[1px] text-[#8b949e]">
                  Repositories ({repos.length})
                </span>
                <button
                  onClick={handleSync}
                  disabled={isSyncing}
                  className="rounded border border-[#30363d] bg-transparent px-2.5 py-1 font-['Space_Mono'] text-[10px] text-[#8b949e] transition-all hover:border-[#8b949e] hover:text-[#cdd9e5] disabled:opacity-50"
                >
                  {isSyncing ? 'Syncing...' : 'Refresh'}
                </button>
              </div>

              {/* Search */}
              <input
                type="text"
                placeholder="Search repos..."
                value={repoSearch}
                onChange={(e) => setRepoSearch(e.target.value)}
                className="rounded border border-[#30363d] bg-[#0d1117] px-3 py-2 font-['Space_Mono'] text-[11px] text-[#cdd9e5] placeholder-[#484f58] outline-none focus:border-[#58a6ff]"
              />

              {/* Repo list */}
              {isLoadingRepos ? (
                <div className="flex items-center justify-center py-8">
                  <span className="font-['Space_Mono'] text-[11px] text-[#8b949e] animate-pulse">
                    Loading repos...
                  </span>
                </div>
              ) : filteredRepos.length === 0 ? (
                <div className="flex items-center justify-center py-8">
                  <span className="font-['Space_Mono'] text-[11px] text-[#484f58]">
                    {repoSearch ? 'No matching repos' : 'No repos found'}
                  </span>
                </div>
              ) : (
                <div className="flex flex-col gap-1">
                  {filteredRepos.map((repo) => (
                    <div
                      key={repo.full_name}
                      className="flex items-center justify-between rounded border border-transparent px-3 py-2 transition-colors hover:border-[#21262d] hover:bg-[#161b22]"
                    >
                      <div className="flex flex-col gap-0.5 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="truncate font-['Space_Mono'] text-[11px] font-semibold text-[#58a6ff]">
                            {repo.full_name}
                          </span>
                          {repo.private && (
                            <span className="shrink-0 rounded border border-[#30363d] px-1.5 py-0.5 font-['Space_Mono'] text-[9px] text-[#8b949e]">
                              Private
                            </span>
                          )}
                          {repo.fork && (
                            <span className="shrink-0 rounded border border-[#30363d] px-1.5 py-0.5 font-['Space_Mono'] text-[9px] text-[#8b949e]">
                              Fork
                            </span>
                          )}
                        </div>
                        {repo.description && (
                          <span className="truncate font-['Space_Mono'] text-[10px] text-[#8b949e]">
                            {repo.description}
                          </span>
                        )}
                      </div>
                      <div className="flex shrink-0 items-center gap-3 ml-3">
                        {repo.language && (
                          <span className="font-['Space_Mono'] text-[10px] text-[#8b949e]">
                            {repo.language}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

import { useState, useRef, useEffect } from 'react';
import { GitBranch, Search, Check } from 'lucide-react';
import { useGithubRepos, type GitHubBranch } from '@/hooks/useGithubRepos';

interface BranchPickerProps {
  repoFullName: string;
  onBranchSelect?: (branch: string) => void;
}

export function BranchPicker({ repoFullName, onBranchSelect }: BranchPickerProps) {
  const [search, setSearch] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);
  const { branchesFor, selectedBranch, selectBranch } = useGithubRepos();

  const branchState = branchesFor[repoFullName];
  const branches = branchState?.branches ?? [];
  const loading = branchState?.loading ?? false;
  const currentBranch = selectedBranch[repoFullName] || branchState?.defaultBranch || 'main';

  useEffect(() => {
    searchRef.current?.focus();
  }, []);

  const filtered = search
    ? branches.filter((b) => b.name.toLowerCase().includes(search.toLowerCase()))
    : branches;

  const handleSelect = (branch: GitHubBranch) => {
    selectBranch(repoFullName, branch.name);
    onBranchSelect?.(branch.name);
  };

  return (
    <div className="flex flex-col gap-1">
      {/* Search input */}
      <div className="flex items-center gap-2 rounded-lg bg-[#0a0e14] border border-[#1DD3E6]/20 focus-within:border-[#1DD3E6]/50 transition-colors px-3 py-2.5">
        <Search className="h-3.5 w-3.5 text-[#4b535d] flex-shrink-0" />
        <input
          ref={searchRef}
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search branches..."
          className="flex-1 bg-transparent text-xs text-[#cdd9e5] placeholder-[#4b535d] outline-none ring-0 border-0 focus:outline-none focus:ring-0"
        />
      </div>

      {/* Branch list */}
      <div className="flex flex-col gap-0.5 max-h-[180px] overflow-y-auto">
        {loading && branches.length === 0 ? (
          <div className="flex justify-center py-4">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
        ) : filtered.length === 0 ? (
          <p className="text-[11px] text-[#4b535d] text-center py-3">
            {search ? 'No matching branches' : 'No branches found'}
          </p>
        ) : (
          filtered.map((branch) => {
            const isSelected = branch.name === currentBranch;
            return (
              <button
                key={branch.name}
                onClick={() => handleSelect(branch)}
                className={`flex items-center justify-between rounded-lg px-3 py-2.5 text-left transition-colors ${
                  isSelected
                    ? 'bg-[#1DD3E608]'
                    : 'hover:bg-[#1DD3E608]'
                }`}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <span
                    className={`h-1.5 w-1.5 rounded-full flex-shrink-0 ${
                      isSelected
                        ? 'bg-gradient-to-br from-[#1DD3E6] to-[#a371f7]'
                        : 'bg-[#2d333b]'
                    }`}
                  />
                  <span
                    className={`text-xs truncate ${
                      isSelected
                        ? 'text-[#cdd9e5] font-medium'
                        : 'text-[#768390]'
                    }`}
                  >
                    {branch.name}
                  </span>
                  {branch.isDefault && (
                    <span className="flex-shrink-0 rounded-md bg-[#1DD3E615] px-2 py-0.5 text-[9px] font-medium text-[#1DD3E6]">
                      default
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                  {isSelected && (
                    <Check className="h-3.5 w-3.5 text-[#3fb950]" />
                  )}
                </div>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}

/** Branch pill button — shows current branch, click to expand */
export function BranchPill({
  repoFullName,
  onClick,
  isExpanded,
}: {
  repoFullName: string;
  onClick: () => void;
  isExpanded: boolean;
}) {
  const { selectedBranch, branchesFor } = useGithubRepos();
  const branchState = branchesFor[repoFullName];
  const currentBranch = selectedBranch[repoFullName] || branchState?.defaultBranch || 'main';

  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-medium transition-all ${
        isExpanded
          ? 'bg-[#1DD3E612] text-[#1DD3E6] shadow-[0_0_8px_rgba(29,211,230,0.15)]'
          : 'bg-[#1DD3E60a] text-[#1DD3E6] hover:bg-[#1DD3E612]'
      }`}
    >
      <GitBranch className="h-3 w-3" />
      <span className="max-w-[120px] truncate">{currentBranch}</span>
      <span className={`text-[9px] transition-transform ${isExpanded ? 'rotate-180' : ''}`}>
        ▾
      </span>
    </button>
  );
}

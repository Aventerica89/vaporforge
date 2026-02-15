import { useStreamDebug } from '@/hooks/useStreamDebug';
import { useSandboxStore } from '@/hooks/useSandbox';

function formatTokenCount(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

export function TokenViewer() {
  const metrics = useStreamDebug((s) => s.metrics);
  const messageIds = useSandboxStore((s) => s.messageIds);
  const messagesById = useSandboxStore((s) => s.messagesById);

  // Per-message token estimates
  const messageRows = messageIds
    .map((id) => messagesById[id])
    .filter(Boolean)
    .map((msg) => {
      const charCount = msg.content.length;
      const estimated = Math.ceil(charCount / 4);
      return {
        id: msg.id,
        role: msg.role,
        estimated,
        charCount,
      };
    });

  const totalInput = messageRows
    .filter((r) => r.role === 'user')
    .reduce((sum, r) => sum + r.estimated, 0);

  const totalOutput = messageRows
    .filter((r) => r.role === 'assistant')
    .reduce((sum, r) => sum + r.estimated, 0);

  return (
    <div className="flex h-64 flex-col">
      {/* Summary row */}
      <div className="flex items-center gap-4 border-b border-border/40 px-3 py-2">
        <div className="flex flex-col">
          <span className="text-[10px] text-muted-foreground/60">Input</span>
          <span className="text-xs font-mono font-semibold text-primary">
            ~{formatTokenCount(totalInput)}
          </span>
        </div>
        <div className="flex flex-col">
          <span className="text-[10px] text-muted-foreground/60">Output</span>
          <span className="text-xs font-mono font-semibold text-secondary">
            ~{formatTokenCount(totalOutput)}
          </span>
        </div>
        <div className="flex flex-col">
          <span className="text-[10px] text-muted-foreground/60">Total</span>
          <span className="text-xs font-mono font-semibold text-foreground">
            ~{formatTokenCount(totalInput + totalOutput)}
          </span>
        </div>
        {metrics.tokensPerSec != null && (
          <div className="flex flex-col">
            <span className="text-[10px] text-muted-foreground/60">Speed</span>
            <span className="text-xs font-mono font-semibold text-foreground">
              ~{metrics.tokensPerSec} tok/s
            </span>
          </div>
        )}
      </div>

      {/* Per-message table */}
      <div className="flex-1 overflow-y-auto">
        {messageRows.length === 0 ? (
          <div className="flex h-full items-center justify-center text-[10px] text-muted-foreground/40">
            No messages yet
          </div>
        ) : (
          <table className="w-full text-[10px]">
            <thead>
              <tr className="border-b border-border/20">
                <th className="px-2 py-1 text-left font-medium text-muted-foreground/60">Role</th>
                <th className="px-2 py-1 text-right font-medium text-muted-foreground/60">Chars</th>
                <th className="px-2 py-1 text-right font-medium text-muted-foreground/60">~Tokens</th>
              </tr>
            </thead>
            <tbody>
              {messageRows.map((row) => (
                <tr key={row.id} className="hover:bg-muted/10">
                  <td className="px-2 py-0.5">
                    <span className={`rounded px-1 py-0.5 ${
                      row.role === 'user'
                        ? 'bg-primary/10 text-primary'
                        : 'bg-secondary/10 text-secondary'
                    }`}>
                      {row.role}
                    </span>
                  </td>
                  <td className="px-2 py-0.5 text-right tabular-nums text-muted-foreground/70">
                    {row.charCount.toLocaleString()}
                  </td>
                  <td className="px-2 py-0.5 text-right tabular-nums font-mono">
                    ~{formatTokenCount(row.estimated)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

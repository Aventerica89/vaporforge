import { ArrowRight } from 'lucide-react';
import { ClaudeIcon } from '@/components/icons/ClaudeIcon';
import { GeminiIcon } from '@/components/icons/GeminiIcon';
import { cn } from '@/lib/cn';
import type { MessagePart } from '@/lib/types';

export type HandoffChainProps = {
  parts: MessagePart[];
  className?: string;
};

type ChainNode = {
  agent: 'claude' | 'gemini';
  label: string;
  count: number;
};

function buildChain(parts: MessagePart[]): ChainNode[] {
  const toolParts = parts.filter((p) => p.type === 'tool-start' && p.name);
  if (toolParts.length === 0) return [];

  const nodes: ChainNode[] = [];

  for (const part of toolParts) {
    const name = part.name?.toLowerCase() ?? '';
    const agent: 'claude' | 'gemini' = name.startsWith('gemini_') ? 'gemini' : 'claude';
    const label = agent === 'gemini' ? 'Gemini' : 'Claude';

    const last = nodes[nodes.length - 1];
    if (last && last.agent === agent) {
      last.count++;
    } else {
      nodes.push({ agent, label, count: 1 });
    }
  }

  return nodes;
}

const AGENT_ICON: Record<'claude' | 'gemini', React.ReactNode> = {
  claude: <ClaudeIcon className="size-3" />,
  gemini: <GeminiIcon className="size-3" />,
};

const AGENT_COLOR: Record<'claude' | 'gemini', string> = {
  claude: 'text-[#D97757] border-[#D97757]/30 bg-[#D97757]/10',
  gemini: 'text-blue-400 border-blue-400/30 bg-blue-400/10',
};

export function HandoffChain({ parts, className }: HandoffChainProps) {
  const chain = buildChain(parts);

  const hasMultiple = chain.some((n) => n.agent === 'gemini') && chain.some((n) => n.agent === 'claude');
  if (!hasMultiple || chain.length < 2) return null;

  return (
    <div
      className={cn(
        'mb-2 flex flex-wrap items-center gap-1 rounded-lg border border-border/30 bg-muted/20 px-2.5 py-1.5',
        className,
      )}
    >
      {chain.map((node, i) => (
        <div key={i} className="flex items-center gap-1">
          {i > 0 && <ArrowRight className="size-2.5 shrink-0 text-muted-foreground/50" />}
          <div
            className={cn(
              'flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-medium',
              AGENT_COLOR[node.agent],
            )}
          >
            {AGENT_ICON[node.agent]}
            <span>{node.label}</span>
            {node.count > 1 && (
              <span className="opacity-60">×{node.count}</span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

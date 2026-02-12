import type { CardSize } from '@/hooks/useMarketplace';

interface CardSizeToggleProps {
  size: CardSize;
  onChange: (size: CardSize) => void;
}

const SIZES: Array<{ value: CardSize; label: string }> = [
  { value: 'compact', label: 'Compact' },
  { value: 'normal', label: 'Normal' },
  { value: 'large', label: 'Large' },
];

export function CardSizeToggle({ size, onChange }: CardSizeToggleProps) {
  return (
    <div className="flex items-center gap-0.5 rounded-lg border border-white/[0.08] bg-white/[0.03] p-0.5">
      {SIZES.map((s) => (
        <button
          key={s.value}
          onClick={() => onChange(s.value)}
          title={s.label}
          className={`rounded-md p-1.5 transition-all duration-200 ${
            size === s.value
              ? 'bg-cyan-500/15 text-cyan-400 shadow-sm'
              : 'text-[hsl(180,5%,40%)] hover:text-[hsl(180,5%,65%)]'
          }`}
        >
          <SizeIcon size={s.value} />
        </button>
      ))}
    </div>
  );
}

function SizeIcon({ size }: { size: CardSize }) {
  if (size === 'compact') {
    return (
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
        <rect x="0.5" y="0.5" width="3.5" height="3.5" rx="0.5" fill="currentColor" opacity="0.5" />
        <rect x="5.25" y="0.5" width="3.5" height="3.5" rx="0.5" fill="currentColor" opacity="0.5" />
        <rect x="10" y="0.5" width="3.5" height="3.5" rx="0.5" fill="currentColor" opacity="0.5" />
        <rect x="0.5" y="5.25" width="3.5" height="3.5" rx="0.5" fill="currentColor" opacity="0.5" />
        <rect x="5.25" y="5.25" width="3.5" height="3.5" rx="0.5" fill="currentColor" opacity="0.5" />
        <rect x="10" y="5.25" width="3.5" height="3.5" rx="0.5" fill="currentColor" opacity="0.5" />
        <rect x="0.5" y="10" width="3.5" height="3.5" rx="0.5" fill="currentColor" opacity="0.5" />
        <rect x="5.25" y="10" width="3.5" height="3.5" rx="0.5" fill="currentColor" opacity="0.5" />
        <rect x="10" y="10" width="3.5" height="3.5" rx="0.5" fill="currentColor" opacity="0.5" />
      </svg>
    );
  }
  if (size === 'normal') {
    return (
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
        <rect x="0.5" y="0.5" width="5.5" height="5.5" rx="0.75" fill="currentColor" opacity="0.5" />
        <rect x="8" y="0.5" width="5.5" height="5.5" rx="0.75" fill="currentColor" opacity="0.5" />
        <rect x="0.5" y="8" width="5.5" height="5.5" rx="0.75" fill="currentColor" opacity="0.5" />
        <rect x="8" y="8" width="5.5" height="5.5" rx="0.75" fill="currentColor" opacity="0.5" />
      </svg>
    );
  }
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <rect x="0.5" y="0.5" width="13" height="5.5" rx="0.75" fill="currentColor" opacity="0.5" />
      <rect x="0.5" y="8" width="13" height="5.5" rx="0.75" fill="currentColor" opacity="0.5" />
    </svg>
  );
}

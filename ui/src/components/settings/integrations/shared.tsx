import type React from 'react';

/** Toggle switch — matches VF Toggle/On and Toggle/Off from design (Z0XBg, IPH6T) */
export function Toggle({ enabled, onClick }: { enabled: boolean; onClick: (e: React.MouseEvent) => void }) {
  return (
    <button
      className={`relative h-4 w-7 shrink-0 rounded-full transition-colors ${
        enabled ? 'bg-[#1DD3E6]' : 'bg-[#768390]/30'
      }`}
      onClick={onClick}
    >
      <span
        className={`absolute top-[3px] h-2.5 w-2.5 rounded-full bg-white shadow-sm transition-[left] ${
          enabled ? 'left-[15px]' : 'left-[3px]'
        }`}
      />
    </button>
  );
}

/** Remove / Confirm button — two-click delete pattern */
export function RemoveButton({
  isConfirming,
  onRemove,
  onConfirm,
}: {
  isConfirming: boolean;
  onRemove: () => void;
  onConfirm: () => void;
}) {
  return (
    <button
      className={`rounded-[4px] px-[7px] py-[2px] font-['Space_Mono'] text-[12px] font-medium transition-all ${
        isConfirming
          ? 'border border-[#f8514959] bg-[#f851491a] text-[#f85149]'
          : 'border border-[#f8514933] bg-[#f851490a] text-[#ef4444] hover:bg-[#f8514933]'
      }`}
      onClick={isConfirming ? onConfirm : onRemove}
    >
      {isConfirming ? 'Confirm?' : 'Remove'}
    </button>
  );
}

/** Uppercase tracking section header — 9px Space Mono bold */
export function SectionHeader({
  children,
  color = '#4b535d',
}: {
  children: React.ReactNode;
  color?: string;
}) {
  return (
    <div
      className="font-['Space_Mono'] text-[9px] font-bold uppercase tracking-[1.2px]"
      style={{ color }}
    >
      {children}
    </div>
  );
}

/** Chevron icon — points right (collapsed) or down (expanded) */
export function Chevron({ expanded, size = 12 }: { expanded: boolean; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={expanded ? '#768390' : '#4b535d'}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`shrink-0 transition-transform ${expanded ? 'rotate-90' : ''}`}
    >
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}

/** Pill selector — used for Mode and Scope selections */
export function PillGroup({
  options,
  value,
  onChange,
  activeColor = '#a371f7',
}: {
  options: Array<{ value: string; label: string }>;
  value: string;
  onChange?: (value: string) => void;
  activeColor?: string;
}) {
  const activeBg = `${activeColor}0a`;
  const activeBorder = `${activeColor}33`;

  return (
    <div className="flex flex-wrap gap-[8px]">
      {options.map((opt) => {
        const isActive = value === opt.value;
        return (
          <button
            key={opt.value}
            className={`rounded-full border px-[12px] py-[4px] font-['Space_Mono'] text-[10px] transition-all ${
              isActive
                ? `border-[${activeBorder}] bg-[${activeBg}] text-[${activeColor}]`
                : 'border-[#30363d] bg-[#161b22] text-[#768390] hover:text-[#cdd9e5]'
            }`}
            style={
              isActive
                ? { borderColor: activeBorder, backgroundColor: activeBg, color: activeColor }
                : undefined
            }
            onClick={() => onChange?.(opt.value)}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

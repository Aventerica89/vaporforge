import {
  CloudflareLogo,
  AnthropicLogo,
  ReactLogo,
  GithubLogo,
} from '@/components/logos';

const STAGES = [
  { label: 'Starting container', key: 'Starting container...' },
  { label: 'Cloning repository', key: 'Cloning repository...' },
  { label: 'Installing dependencies', key: 'Installing dependencies...' },
  { label: 'Starting dev server', key: 'Starting dev server...' },
  { label: 'Exposing preview', key: 'Exposing preview...' },
];

interface Props {
  /** Real-time status message from the poll endpoint */
  statusMessage?: string;
}

export function AgencyLoadingScreen({ statusMessage }: Props) {
  // Determine which stage we're at based on the poll status message
  let activeStage = 0;
  if (statusMessage) {
    const idx = STAGES.findIndex((s) => s.key === statusMessage);
    if (idx >= 0) {
      activeStage = idx;
    } else if (statusMessage === 'Provisioning...') {
      activeStage = 0;
    }
  }

  return (
    <div className="relative flex h-full w-full items-center justify-center overflow-hidden bg-zinc-950">
      {/* Animated grid background */}
      <div className="pointer-events-none absolute inset-0 opacity-[0.03]">
        <div
          className="h-full w-full"
          style={{
            backgroundImage:
              'linear-gradient(rgba(29,211,230,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(29,211,230,0.5) 1px, transparent 1px)',
            backgroundSize: '60px 60px',
          }}
        />
      </div>

      {/* Radial glow from center */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse 600px 400px at center, rgba(29,211,230,0.06) 0%, rgba(233,69,245,0.03) 40%, transparent 70%)',
        }}
      />

      {/* Animated scan line */}
      <div className="agency-scanline pointer-events-none absolute inset-0" />

      {/* Floating circuit particles */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        {[...Array(6)].map((_, i) => (
          <div
            key={i}
            className="agency-particle absolute rounded-full"
            style={{
              width: `${2 + (i % 3)}px`,
              height: `${2 + (i % 3)}px`,
              left: `${10 + i * 15}%`,
              animationDelay: `${i * 0.8}s`,
              background: i % 2 === 0 ? '#1dd3e6' : '#E945F5',
            }}
          />
        ))}
      </div>

      {/* Center content */}
      <div className="relative z-10 flex flex-col items-center gap-10">
        {/* Logo + glow */}
        <div className="relative">
          {/* Outer glow ring */}
          <div className="agency-logo-ring absolute -inset-8 rounded-full" />

          {/* Logo */}
          <div className="relative flex h-28 w-28 items-center justify-center">
            <svg
              width="96"
              height="96"
              viewBox="0 0 512 512"
              className="agency-logo-breathe"
            >
              {/* Background circle */}
              <circle cx="256" cy="256" r="240" fill="rgba(15,20,25,0.8)" />
              {/* Circuit pattern */}
              <g opacity="0.2">
                <path
                  d="M100 100 H200 V200 H300 V300 H400"
                  stroke="#E945F5"
                  strokeWidth="3"
                  className="agency-circuit-draw"
                />
                <path
                  d="M100 200 H150 V250 H200"
                  stroke="#1dd3e6"
                  strokeWidth="3"
                  className="agency-circuit-draw"
                  style={{ animationDelay: '0.5s' }}
                />
              </g>
              {/* Cyan < */}
              <path
                d="M 222 230 L 162 296 L 222 362"
                stroke="#1dd3e6"
                strokeWidth="20"
                strokeLinecap="round"
                strokeLinejoin="round"
                fill="none"
                className="agency-bracket-glow-cyan"
              />
              {/* Purple > */}
              <path
                d="M 290 230 L 350 296 L 290 362"
                stroke="#E945F5"
                strokeWidth="20"
                strokeLinecap="round"
                strokeLinejoin="round"
                fill="none"
                className="agency-bracket-glow-purple"
              />
            </svg>
          </div>
        </div>

        {/* Brand text */}
        <div className="flex flex-col items-center gap-2">
          <span className="agency-text-shimmer font-mono text-sm font-bold uppercase tracking-[0.3em] text-zinc-400">
            Powered by
          </span>
          <h1 className="agency-brand-text font-display text-4xl font-black tracking-wider">
            VaporForge
          </h1>
        </div>

        {/* Tech logos */}
        <div className="flex items-center gap-8 opacity-40">
          {[
            { Logo: CloudflareLogo, label: 'Cloudflare' },
            { Logo: AnthropicLogo, label: 'Anthropic' },
            { Logo: ReactLogo, label: 'React' },
            { Logo: GithubLogo, label: 'GitHub' },
          ].map(({ Logo, label }) => (
            <div key={label} title={label}>
              <Logo className="h-7 w-7 text-zinc-400" />
            </div>
          ))}
        </div>

        {/* Progress stages */}
        <div className="flex flex-col gap-4 pt-2">
          {STAGES.map((stage, i) => {
            const isActive = i === activeStage;
            const isDone = i < activeStage;

            return (
              <div
                key={stage.label}
                className="flex items-center gap-4"
              >
                {/* Status dot */}
                <div className="flex h-6 w-6 items-center justify-center">
                  {isDone ? (
                    <div className="h-3 w-3 rounded-full bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.5)]" />
                  ) : isActive ? (
                    <div className="agency-dot-pulse h-3.5 w-3.5 rounded-full bg-cyan-400 shadow-[0_0_14px_rgba(29,211,230,0.6)]" />
                  ) : (
                    <div className="h-2.5 w-2.5 rounded-full bg-zinc-700" />
                  )}
                </div>

                {/* Label */}
                <span
                  className={`font-mono text-[15px] transition-all duration-500 ${
                    isDone
                      ? 'text-zinc-500'
                      : isActive
                        ? 'font-medium text-cyan-300'
                        : 'text-zinc-600'
                  }`}
                >
                  {stage.label}
                  {isActive && (
                    <span className="agency-ellipsis ml-0.5" />
                  )}
                </span>
              </div>
            );
          })}
        </div>

        {/* Bottom progress bar */}
        <div className="mt-1 h-1 w-64 overflow-hidden rounded-full bg-zinc-800">
          <div className="agency-progress-bar h-full rounded-full" />
        </div>
      </div>
    </div>
  );
}

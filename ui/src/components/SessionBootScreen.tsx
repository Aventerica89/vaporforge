import { useEffect, useState } from 'react';

const BOOT_STEPS = [
  'Allocating container...',
  'Starting sandbox runtime...',
  'Installing Claude SDK...',
  'Configuring workspace...',
  'Syncing plugins...',
  'Almost ready...',
];

export function SessionBootScreen() {
  const [stepIndex, setStepIndex] = useState(0);
  const [dots, setDots] = useState('');

  // Cycle through boot steps on a timer
  useEffect(() => {
    const interval = setInterval(() => {
      setStepIndex((prev) =>
        prev < BOOT_STEPS.length - 1 ? prev + 1 : prev
      );
    }, 2500);
    return () => clearInterval(interval);
  }, []);

  // Animate trailing dots
  useEffect(() => {
    const interval = setInterval(() => {
      setDots((prev) => (prev.length >= 3 ? '' : prev + '.'));
    }, 400);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="flex h-full flex-col items-center justify-center bg-background">
      {/* Glow orb */}
      <div className="relative mb-8">
        <div className="h-20 w-20 rounded-full bg-gradient-to-br from-cyan-500/20 to-violet-500/20 blur-xl animate-pulse" />
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="h-12 w-12 rounded-xl border border-cyan-500/30 bg-card shadow-[0_0_30px_-5px_hsl(185,95%,55%,0.3)] flex items-center justify-center">
            {/* Server icon */}
            <svg
              className="h-6 w-6 text-cyan-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M5.25 14.25h13.5m-13.5 0a3 3 0 01-3-3m3 3a3 3 0 100 6h13.5a3 3 0 100-6m-16.5-3a3 3 0 013-3h13.5a3 3 0 013 3m-19.5 0a4.5 4.5 0 01.9-2.7L5.737 5.1a3.375 3.375 0 012.7-1.35h7.126c1.062 0 2.062.5 2.7 1.35l2.587 3.45a4.5 4.5 0 01.9 2.7m0 0a3 3 0 01-3 3m0 3h.008v.008h-.008v-.008zm0-6h.008v.008h-.008v-.008zm-3 6h.008v.008h-.008v-.008zm0-6h.008v.008h-.008v-.008z"
              />
            </svg>
          </div>
        </div>
      </div>

      {/* Title */}
      <h2 className="mb-2 text-lg font-bold tracking-wide text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-violet-400">
        Booting Sandbox
      </h2>

      {/* Current step */}
      <p className="mb-6 text-sm text-muted-foreground h-5">
        {BOOT_STEPS[stepIndex]}{dots}
      </p>

      {/* Progress bar */}
      <div className="w-64 h-1 rounded-full bg-muted/30 overflow-hidden">
        <div
          className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-violet-500 transition-all duration-700 ease-out"
          style={{
            width: `${Math.min(((stepIndex + 1) / BOOT_STEPS.length) * 100, 95)}%`,
          }}
        />
      </div>

      {/* Step indicators */}
      <div className="mt-6 flex gap-1.5">
        {BOOT_STEPS.map((_, i) => (
          <div
            key={i}
            className={`h-1.5 w-1.5 rounded-full transition-all duration-300 ${
              i <= stepIndex
                ? 'bg-cyan-400 shadow-[0_0_4px_hsl(185,95%,55%,0.5)]'
                : 'bg-muted/20'
            }`}
          />
        ))}
      </div>
    </div>
  );
}

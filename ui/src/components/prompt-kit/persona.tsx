import { cn } from '@/lib/cn';
import React, { createContext, useContext } from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type PersonaState = 'idle' | 'listening' | 'thinking' | 'speaking';

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

type PersonaContextType = {
  state: PersonaState;
  name: string;
};

const PersonaContext = createContext<PersonaContextType | undefined>(undefined);

function usePersonaContext() {
  const context = useContext(PersonaContext);
  if (!context) {
    throw new Error('usePersonaContext must be used within a Persona provider');
  }
  return context;
}

// ---------------------------------------------------------------------------
// Root — Persona
// ---------------------------------------------------------------------------

export type PersonaProps = {
  state?: PersonaState;
  name?: string;
  icon?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
} & Omit<React.ComponentProps<'div'>, 'children'>;

export function Persona({
  state = 'idle',
  name = 'Claude',
  icon,
  children,
  className,
  ...props
}: PersonaProps) {
  return (
    <PersonaContext.Provider value={{ state, name }}>
      <div
        className={cn(
          'inline-flex items-center gap-3',
          'rounded-2xl border border-border/50 bg-background/95 p-4 backdrop-blur-sm',
          className,
        )}
        {...props}
      >
        <PersonaAvatar icon={icon} />
        <div className="flex flex-col gap-1">
          <PersonaName />
          <PersonaWave />
        </div>
        {children}
      </div>
    </PersonaContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// PersonaAvatar
// ---------------------------------------------------------------------------

export type PersonaAvatarProps = {
  icon?: React.ReactNode;
  className?: string;
} & React.ComponentProps<'div'>;

export function PersonaAvatar({ icon, className, ...props }: PersonaAvatarProps) {
  const { state, name } = usePersonaContext();

  const isActive = state === 'speaking' || state === 'listening';

  const initials = name
    .split(' ')
    .map((part) => part[0]?.toUpperCase() ?? '')
    .slice(0, 2)
    .join('');

  return (
    <div
      className={cn('relative flex shrink-0 items-center justify-center', className)}
      {...props}
    >
      {/* Outer pulse ring */}
      <span
        aria-hidden
        className={cn(
          'absolute size-16 rounded-full border border-primary/40',
          'transition-opacity duration-500',
          isActive ? 'animate-ping opacity-40' : 'opacity-0',
        )}
        style={
          isActive
            ? { animationDuration: '2s', animationTimingFunction: 'ease-out' }
            : undefined
        }
      />
      {/* Inner pulse ring */}
      <span
        aria-hidden
        className={cn(
          'absolute size-14 rounded-full border border-primary/30',
          'transition-opacity duration-500',
          isActive ? 'animate-ping opacity-30' : 'opacity-0',
        )}
        style={
          isActive
            ? { animationDuration: '2s', animationTimingFunction: 'ease-out', animationDelay: '0.3s' }
            : undefined
        }
      />

      {/* Avatar circle */}
      <div
        className={cn(
          'relative size-16 overflow-hidden rounded-full',
          'border border-primary/30 bg-background',
          'flex items-center justify-center',
          'transition-[border-color] duration-300',
          isActive && 'border-primary/60',
        )}
      >
        {/* Grid overlay — #4f4f4f2e is the only allowed hardcoded hex per prompt-kit rules */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundImage: `
              linear-gradient(#4f4f4f2e 1px, transparent 1px),
              linear-gradient(to right, #4f4f4f2e 1px, transparent 1px)
            `,
            backgroundSize: '12px 12px',
          }}
        />

        {/* Icon or initials */}
        <span className="relative z-10 flex items-center justify-center text-muted-foreground">
          {icon ?? (
            <span className="text-sm font-semibold tracking-tight text-foreground/70">
              {initials}
            </span>
          )}
        </span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// PersonaName
// ---------------------------------------------------------------------------

export type PersonaNameProps = {
  className?: string;
} & React.ComponentProps<'div'>;

const STATUS_LABELS: Record<PersonaState, string> = {
  idle: 'Idle',
  listening: 'Listening...',
  thinking: 'Thinking...',
  speaking: 'Speaking...',
};

export function PersonaName({ className, ...props }: PersonaNameProps) {
  const { state, name } = usePersonaContext();

  return (
    <div className={cn('flex flex-col gap-0.5', className)} {...props}>
      <span className="text-sm font-medium leading-none text-foreground">{name}</span>
      <span className="text-xs leading-none text-muted-foreground">
        {STATUS_LABELS[state]}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// PersonaWave — 5 animated audio bars
// ---------------------------------------------------------------------------

export type PersonaWaveProps = {
  className?: string;
} & React.ComponentProps<'div'>;

// scaleY values per bar for the speaking animation peak heights
const BAR_PEAKS = [0.4, 0.9, 1.0, 0.75, 0.5];
const BAR_DELAYS = [0, 120, 60, 180, 90];

export function PersonaWave({ className, ...props }: PersonaWaveProps) {
  const { state } = usePersonaContext();

  const isSpeaking = state === 'speaking';

  return (
    <div
      className={cn('flex items-center gap-0.5', className)}
      aria-hidden
      {...props}
    >
      {BAR_PEAKS.map((peak, i) => (
        <span
          key={i}
          className={cn(
            'w-0.5 rounded-full bg-primary',
            'transition-transform duration-300',
          )}
          style={{
            height: '16px',
            transform: isSpeaking ? `scaleY(${peak})` : 'scaleY(0.15)',
            transformOrigin: 'center',
            transitionDelay: isSpeaking ? `${BAR_DELAYS[i]}ms` : '0ms',
          }}
        />
      ))}
    </div>
  );
}

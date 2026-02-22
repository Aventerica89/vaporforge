import { cn } from '@/lib/cn';
import { motion, type Transition } from 'motion/react';

export type BorderTrailProps = {
  className?: string;
  size?: number;
  radius?: number;
  transition?: Transition;
  onAnimationComplete?: () => void;
  style?: React.CSSProperties;
};

export function BorderTrail({
  className,
  size = 60,
  radius = 0,
  transition,
  onAnimationComplete,
  style,
}: BorderTrailProps) {
  const defaultTransition: Transition = {
    repeat: Infinity,
    duration: 5,
    ease: 'linear',
  };

  return (
    <div className="pointer-events-none absolute inset-0 rounded-[inherit] border border-transparent [mask-clip:padding-box,border-box] [mask-composite:intersect] [mask-image:linear-gradient(transparent,transparent),linear-gradient(#000,#000)]">
      <motion.div
        className={cn('absolute aspect-square', className)}
        style={{
          width: size,
          offsetPath: radius > 0 ? `inset(0 round ${radius}px)` : 'inset(0)',
          ...style,
        }}
        animate={{ offsetDistance: ['0%', '100%'] }}
        transition={transition ?? defaultTransition}
        onAnimationComplete={onAnimationComplete}
      />
    </div>
  );
}

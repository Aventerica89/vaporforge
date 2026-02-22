import { cn } from '@/lib/cn';
import { motion, type Transition } from 'motion/react';
import { useRef, useEffect, useState } from 'react';

export type BorderTrailProps = {
  className?: string;
  size?: number;
  radius?: number;
  transition?: Transition;
  onAnimationComplete?: () => void;
  style?: React.CSSProperties;
};

// Build an SVG path string for a rounded rectangle.
// Using path() is widely supported; rect(... round ...) is not.
function roundedRectPath(w: number, h: number, r: number): string {
  const clamped = Math.min(r, w / 2, h / 2);
  return [
    `M ${clamped},0`,
    `H ${w - clamped}`,
    `A ${clamped},${clamped} 0 0 1 ${w},${clamped}`,
    `V ${h - clamped}`,
    `A ${clamped},${clamped} 0 0 1 ${w - clamped},${h}`,
    `H ${clamped}`,
    `A ${clamped},${clamped} 0 0 1 0,${h - clamped}`,
    `V ${clamped}`,
    `A ${clamped},${clamped} 0 0 1 ${clamped},0`,
    'Z',
  ].join(' ');
}

export function BorderTrail({
  className,
  size = 60,
  radius = 0,
  transition,
  onAnimationComplete,
  style,
}: BorderTrailProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [offsetPath, setOffsetPath] = useState('');

  useEffect(() => {
    const update = () => {
      const el = containerRef.current;
      if (!el) return;
      const { width, height } = el.getBoundingClientRect();
      if (width > 0 && height > 0) {
        setOffsetPath(`path("${roundedRectPath(width, height, radius)}")`);
      }
    };

    update();
    const observer = new ResizeObserver(update);
    if (containerRef.current) observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [radius]);

  const defaultTransition: Transition = {
    repeat: Infinity,
    duration: 5,
    ease: 'linear',
  };

  return (
    <div
      ref={containerRef}
      className="pointer-events-none absolute inset-0 rounded-[inherit] border border-transparent [mask-clip:padding-box,border-box] [mask-composite:intersect] [mask-image:linear-gradient(transparent,transparent),linear-gradient(#000,#000)]"
    >
      {offsetPath && (
        <motion.div
          className={cn('absolute aspect-square', className)}
          style={{ width: size, offsetPath, ...style }}
          animate={{ offsetDistance: ['0%', '100%'] }}
          transition={transition ?? defaultTransition}
          onAnimationComplete={onAnimationComplete}
        />
      )}
    </div>
  );
}

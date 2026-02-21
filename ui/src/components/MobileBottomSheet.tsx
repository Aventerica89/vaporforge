import { useEffect, useRef, useCallback } from 'react';
import { X } from 'lucide-react';
import { useKeyboard } from '@/hooks/useKeyboard';
import { useFocusTrap } from '@/hooks/useFocusTrap';
import { haptics } from '@/lib/haptics';

interface MobileBottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}

export function MobileBottomSheet({
  isOpen,
  onClose,
  title,
  children,
}: MobileBottomSheetProps) {
  // H7 HIG fix: Focus trap keeps keyboard navigation inside the sheet.
  const containerRef = useFocusTrap(isOpen, onClose) as React.RefObject<HTMLDivElement>;
  const dragStartY = useRef<number | null>(null);
  const currentTranslateY = useRef(0);
  const { isVisible: keyboardOpen, height: keyboardHeight } = useKeyboard();

  // Body is permanently position:fixed via CSS — no per-component manipulation needed

  // Close sheet if keyboard opens (MobileLayout also does this,
  // but this is a safety net for standalone usage)
  useEffect(() => {
    if (keyboardOpen && isOpen) {
      onClose();
    }
  }, [keyboardOpen, isOpen, onClose]);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    const target = e.target as HTMLElement;
    // Only start drag from the handle area
    if (!target.closest('[data-drag-handle]')) return;
    dragStartY.current = e.touches[0].clientY;
    currentTranslateY.current = 0;
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (dragStartY.current === null) return;
    const deltaY = e.touches[0].clientY - dragStartY.current;
    // Only allow dragging down
    if (deltaY < 0) return;
    currentTranslateY.current = deltaY;
    if (containerRef.current) {
      containerRef.current.style.transform = `translateY(${deltaY}px)`;
    }
  }, []);

  const handleTouchEnd = useCallback(() => {
    if (dragStartY.current === null) return;
    dragStartY.current = null;

    // If dragged more than 100px down, close
    if (currentTranslateY.current > 100) {
      haptics.medium();
      onClose();
    }

    // Reset position
    if (containerRef.current) {
      containerRef.current.style.transform = '';
    }
    currentTranslateY.current = 0;
  }, [onClose]);

  // Shrink max-height when keyboard is open (fallback — normally sheet
  // is closed when keyboard opens, but this handles edge cases)
  const maxHeight = keyboardOpen
    ? `calc(75vh - ${keyboardHeight}px)`
    : '75vh';

  return (
    <>
      {/* Backdrop — touch-action: none in CSS, onTouchMove prevents scroll bleed */}
      <div
        className={`mobile-backdrop fixed inset-0 z-[60] bg-black/60 ${
          isOpen ? 'open' : ''
        }`}
        onClick={onClose}
        onTouchMove={(e) => e.preventDefault()}
      />

      {/* Sheet */}
      <div
        ref={containerRef}
        className={`mobile-sheet fixed inset-x-0 bottom-0 z-[61] flex flex-col rounded-t-2xl ${
          isOpen ? 'open' : ''
        }`}
        style={{
          maxHeight,
          background: 'hsl(var(--card) / 0.95)',
          WebkitBackdropFilter: 'blur(12px) saturate(150%)',
          backdropFilter: 'blur(12px) saturate(150%)',
          border: '1px solid hsl(var(--border))',
          borderBottom: 'none',
        } as React.CSSProperties}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {/* Drag handle */}
        {/* Drag handle with iOS-compliant touch target */}
        <div
          data-drag-handle
          className="flex flex-col items-center py-4 cursor-grab active:cursor-grabbing"
        >
          <div className="h-1 w-12 rounded-full bg-muted-foreground/30" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-4 pb-3">
          <h3 className="font-display text-xs font-bold uppercase tracking-widest text-muted-foreground">
            {title}
          </h3>
          <button
            onClick={onClose}
            className="flex h-9 w-9 sm:h-11 sm:w-11 items-center justify-center rounded-full hover:bg-accent active:scale-95 transition-transform"
            aria-label="Close"
          >
            <X className="h-5 w-5 text-muted-foreground" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-4 pb-6 safe-bottom">
          {children}
        </div>
      </div>
    </>
  );
}

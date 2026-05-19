import { useEffect, useId, useRef, useState, type ReactElement, type ReactNode } from 'react';
import './Tooltip.css';

interface TooltipProps {
  content: ReactNode;
  children: ReactElement;
  delayMs?: number;
  placement?: 'top' | 'bottom';
}

export default function Tooltip({
  content,
  children,
  delayMs = 100,
  placement = 'top',
}: TooltipProps) {
  const [visible, setVisible] = useState(false);
  const showTimerRef = useRef<number | null>(null);
  const tooltipId = useId();
  const wrapRef = useRef<HTMLSpanElement>(null);

  // Touch devices can't hover, so swap the hover path for a tap-toggle with
  // outside-tap dismiss. Read synchronously so the very first render already
  // knows which path to take. Focus/blur stay active on all devices so
  // keyboard users (incl. external keyboards on tablets) keep working.
  const isTouchOnly = useRef(
    typeof window !== 'undefined' &&
      window.matchMedia('(hover: none)').matches
  );

  const clearShowTimer = () => {
    if (showTimerRef.current !== null) {
      window.clearTimeout(showTimerRef.current);
      showTimerRef.current = null;
    }
  };

  const scheduleShow = () => {
    clearShowTimer();
    if (delayMs <= 0) {
      setVisible(true);
      return;
    }
    showTimerRef.current = window.setTimeout(() => {
      setVisible(true);
      showTimerRef.current = null;
    }, delayMs);
  };

  const hide = () => {
    clearShowTimer();
    setVisible(false);
  };

  // Mouse path — disabled on touch to avoid synthesized-mouse-event noise.
  const handleMouseEnter = () => {
    if (isTouchOnly.current) return;
    scheduleShow();
  };

  const handleMouseLeave = () => {
    if (isTouchOnly.current) return;
    hide();
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    if (!isTouchOnly.current) return;
    if (e.pointerType !== 'touch' && e.pointerType !== 'pen') return;
    // Cancel any pending focus-triggered show so a stale timer can't re-open
    // the tooltip right after the user taps to dismiss.
    clearShowTimer();
    setVisible((v) => !v);
  };

  // Outside-tap dismiss — only runs while a touch-shown tooltip is visible.
  useEffect(() => {
    if (!visible || !isTouchOnly.current) return;
    const handleOutside = (e: PointerEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setVisible(false);
      }
    };
    document.addEventListener('pointerdown', handleOutside, true);
    return () => document.removeEventListener('pointerdown', handleOutside, true);
  }, [visible]);

  useEffect(() => {
    return () => clearShowTimer();
  }, []);

  return (
    <span
      ref={wrapRef}
      className="tooltip-wrap"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onFocus={scheduleShow}
      onBlur={hide}
      onPointerDown={handlePointerDown}
      aria-describedby={visible ? tooltipId : undefined}
    >
      {children}
      {visible && (
        <span
          id={tooltipId}
          role="tooltip"
          className={`tooltip tooltip--${placement}`}
        >
          {content}
        </span>
      )}
    </span>
  );
}

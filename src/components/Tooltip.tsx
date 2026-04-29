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

  useEffect(() => {
    return () => clearShowTimer();
  }, []);

  return (
    <span
      className="tooltip-wrap"
      onMouseEnter={scheduleShow}
      onMouseLeave={hide}
      onFocus={scheduleShow}
      onBlur={hide}
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

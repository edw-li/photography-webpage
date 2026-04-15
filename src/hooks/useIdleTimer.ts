import { useState, useEffect, useCallback, useRef } from 'react';
import { setIdleLogoutTriggered } from '../api/client';

const IDLE_TIMEOUT_MS = 30 * 60 * 1000;
const WARNING_BEFORE_MS = 5 * 60 * 1000;
const CHECK_INTERVAL_MS = 1_000;
const ACTIVITY_THROTTLE_MS = 1_000;
export const STORAGE_ACTIVITY_KEY = 'lastActivityTimestamp';
export const STORAGE_LOGOUT_KEY = 'logoutEvent';
const ACTIVITY_EVENTS: (keyof DocumentEventMap)[] = [
  'mousemove',
  'mousedown',
  'keydown',
  'scroll',
  'touchstart',
  'click',
];

interface UseIdleTimerParams {
  isAuthenticated: boolean;
  onLogout: () => void;
}

interface UseIdleTimerReturn {
  isWarningVisible: boolean;
  remainingSeconds: number;
  extendSession: () => void;
}

function recordActivity(): void {
  localStorage.setItem(STORAGE_ACTIVITY_KEY, Date.now().toString());
}

export default function useIdleTimer({
  isAuthenticated,
  onLogout,
}: UseIdleTimerParams): UseIdleTimerReturn {
  const [isWarningVisible, setIsWarningVisible] = useState(false);
  const [remainingSeconds, setRemainingSeconds] = useState(0);
  const lastThrottleWrite = useRef(0);
  const logoutFired = useRef(false);
  const onLogoutRef = useRef(onLogout);
  onLogoutRef.current = onLogout;

  const checkIdleState = useCallback(() => {
    const stored = localStorage.getItem(STORAGE_ACTIVITY_KEY);
    if (!stored) return;

    const elapsed = Date.now() - parseInt(stored, 10);

    if (elapsed >= IDLE_TIMEOUT_MS) {
      if (!logoutFired.current) {
        logoutFired.current = true;
        setIdleLogoutTriggered(true);
        localStorage.setItem(STORAGE_LOGOUT_KEY, Date.now().toString());
        onLogoutRef.current();
      }
    } else if (elapsed >= IDLE_TIMEOUT_MS - WARNING_BEFORE_MS) {
      setIsWarningVisible(true);
      setRemainingSeconds(Math.ceil((IDLE_TIMEOUT_MS - elapsed) / 1000));
    } else {
      setIsWarningVisible(false);
      setRemainingSeconds(0);
    }
  }, []);

  const extendSession = useCallback(() => {
    recordActivity();
    setIsWarningVisible(false);
    setRemainingSeconds(0);
  }, []);

  useEffect(() => {
    if (!isAuthenticated) {
      setIsWarningVisible(false);
      setRemainingSeconds(0);
      logoutFired.current = false;
      return;
    }

    // Initialize activity timestamp
    recordActivity();
    logoutFired.current = false;

    // Throttled activity handler
    const handleActivity = () => {
      if (logoutFired.current) return;
      const now = Date.now();
      if (now - lastThrottleWrite.current >= ACTIVITY_THROTTLE_MS) {
        lastThrottleWrite.current = now;
        recordActivity();
      }
    };

    // Attach DOM activity listeners
    for (const event of ACTIVITY_EVENTS) {
      document.addEventListener(event, handleActivity, {
        passive: true,
        capture: true,
      });
    }

    // 1-second check interval
    const intervalId = setInterval(checkIdleState, CHECK_INTERVAL_MS);

    // Visibility change — run immediate check on wake/tab focus
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        checkIdleState();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);

    // Cross-tab sync: detect logout from another tab
    const handleStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_LOGOUT_KEY && e.newValue && !logoutFired.current) {
        logoutFired.current = true;
        setIdleLogoutTriggered(true);
        onLogoutRef.current();
      }
    };
    window.addEventListener('storage', handleStorage);

    return () => {
      for (const event of ACTIVITY_EVENTS) {
        document.removeEventListener(event, handleActivity, { capture: true });
      }
      clearInterval(intervalId);
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('storage', handleStorage);
    };
  }, [isAuthenticated, checkIdleState]);

  return { isWarningVisible, remainingSeconds, extendSession };
}

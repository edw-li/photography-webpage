import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { getUnreadCount, UNREAD_COUNT_EVENT } from '../api/notifications';

interface UseUnreadCountResult {
  count: number;
  refetch: () => Promise<void>;
  setCount: (n: number) => void;
}

export default function useUnreadCount(): UseUnreadCountResult {
  const { isAuthenticated } = useAuth();
  const [count, setCount] = useState(0);
  const [prevAuth, setPrevAuth] = useState(isAuthenticated);

  // Track the live auth state in a ref so in-flight fetches don't write a stale
  // count back into state after the user logs out mid-request.
  const isAuthRef = useRef(isAuthenticated);
  isAuthRef.current = isAuthenticated;

  // Reset count when auth state flips (in-render pattern; avoids setState-in-effect)
  if (prevAuth !== isAuthenticated) {
    setPrevAuth(isAuthenticated);
    if (count !== 0) setCount(0);
  }

  const refetch = useCallback(async () => {
    if (!isAuthRef.current) return;
    try {
      const res = await getUnreadCount();
      // Re-check after await: the user may have logged out while the request was in flight
      if (!isAuthRef.current) return;
      setCount(res.count);
    } catch {
      // Silent — keep last known count
    }
  }, []);

  // Initial fetch + on focus + on unread-count-changed events
  useEffect(() => {
    if (!isAuthenticated) return;
    refetch();
    const onFocus = () => { refetch(); };
    const onChanged = () => { refetch(); };
    window.addEventListener('focus', onFocus);
    window.addEventListener(UNREAD_COUNT_EVENT, onChanged);
    return () => {
      window.removeEventListener('focus', onFocus);
      window.removeEventListener(UNREAD_COUNT_EVENT, onChanged);
    };
  }, [isAuthenticated, refetch]);

  return { count, refetch, setCount };
}

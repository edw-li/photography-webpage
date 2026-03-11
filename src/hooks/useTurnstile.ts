import { useEffect, useRef, useCallback } from 'react';

const SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY || '';

export function useTurnstile(containerRef: React.RefObject<HTMLElement | null>) {
  const widgetIdRef = useRef<string | null>(null);
  const tokenRef = useRef<string | null>(null);

  useEffect(() => {
    if (!SITE_KEY || !containerRef.current) return;

    let interval: ReturnType<typeof setInterval> | null = null;
    let timeout: ReturnType<typeof setTimeout> | null = null;

    const renderWidget = () => {
      if (!window.turnstile || !containerRef.current) return;
      // Avoid double-render
      if (widgetIdRef.current !== null) return;

      widgetIdRef.current = window.turnstile.render(containerRef.current, {
        sitekey: SITE_KEY,
        size: 'invisible',
        callback: (token: string) => {
          tokenRef.current = token;
        },
        'expired-callback': () => {
          tokenRef.current = null;
        },
        'error-callback': () => {
          tokenRef.current = null;
        },
      });
    };

    // Turnstile script may load asynchronously
    if (window.turnstile) {
      renderWidget();
    } else {
      interval = setInterval(() => {
        if (window.turnstile) {
          if (interval) clearInterval(interval);
          renderWidget();
        }
      }, 200);
      timeout = setTimeout(() => { if (interval) clearInterval(interval); }, 10000);
    }

    return () => {
      if (interval) clearInterval(interval);
      if (timeout) clearTimeout(timeout);
      if (widgetIdRef.current !== null && window.turnstile) {
        window.turnstile.remove(widgetIdRef.current);
        widgetIdRef.current = null;
      }
    };
  }, [containerRef]);

  const getToken = useCallback((): string | null => {
    if (!SITE_KEY) return null; // Turnstile not configured — skip
    if (widgetIdRef.current !== null && window.turnstile) {
      return window.turnstile.getResponse(widgetIdRef.current) ?? tokenRef.current;
    }
    return tokenRef.current;
  }, []);

  const resetWidget = useCallback(() => {
    tokenRef.current = null;
    if (widgetIdRef.current !== null && window.turnstile) {
      window.turnstile.reset(widgetIdRef.current);
    }
  }, []);

  return { getToken, resetWidget };
}

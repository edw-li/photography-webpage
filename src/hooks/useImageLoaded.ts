import { useState, useEffect, useCallback, useRef } from 'react';

export function useImageLoaded(src: string | undefined) {
  const [loaded, setLoaded] = useState(false);
  const prevSrc = useRef(src);

  useEffect(() => {
    if (prevSrc.current !== src) {
      setLoaded(false);
      prevSrc.current = src;
    }
  }, [src]);

  const handleLoad = useCallback(() => setLoaded(true), []);
  const handleError = useCallback(() => setLoaded(true), []); // stop shimmer on error

  return { loaded, handleLoad, handleError };
}

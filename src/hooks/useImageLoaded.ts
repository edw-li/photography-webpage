import { useState, useEffect, useCallback, useRef } from 'react';

export function useImageLoaded(src: string | undefined) {
  const [loaded, setLoaded] = useState(false);
  const [errored, setErrored] = useState(false);
  const prevSrc = useRef(src);

  useEffect(() => {
    if (prevSrc.current !== src) {
      setLoaded(false);
      setErrored(false);
      prevSrc.current = src;
    }
  }, [src]);

  const handleLoad = useCallback(() => setLoaded(true), []);
  const handleError = useCallback(() => {
    setErrored(true);
    setLoaded(true);
  }, []);

  return { loaded, errored, handleLoad, handleError };
}

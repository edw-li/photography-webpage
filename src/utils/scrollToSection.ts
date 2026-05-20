export function scrollToSection(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
}

// Scroll to a section robustly across async content. Sections that fetch on
// mount (Gallery, Events, Newsletter, Members) grow the document height as
// data arrives, pushing the target section past where a one-shot scroll
// originally aimed. This helper re-scrolls each time document.body resizes,
// aborts on user input, and self-terminates once layout has been stable for
// STABLE_MS or after HARD_CAP_MS, whichever comes first.
export function scrollToSectionWhenSettled(id: string): () => void {
  const INITIAL_DELAY_MS = 100;
  const STABLE_MS = 500;
  const HARD_CAP_MS = 4000;

  let cancelled = false;
  let stableTimer: number | undefined;
  let initialTimer: number | undefined;
  let hardCapTimer: number | undefined;

  const scrollOnce = () => {
    if (cancelled) return;
    scrollToSection(id);
  };

  const onUserInput = () => cleanup();

  const cleanup = () => {
    if (cancelled) return;
    cancelled = true;
    if (initialTimer !== undefined) window.clearTimeout(initialTimer);
    if (stableTimer !== undefined) window.clearTimeout(stableTimer);
    if (hardCapTimer !== undefined) window.clearTimeout(hardCapTimer);
    ro.disconnect();
    window.removeEventListener('wheel', onUserInput);
    window.removeEventListener('touchmove', onUserInput);
    window.removeEventListener('touchstart', onUserInput);
    window.removeEventListener('keydown', onUserInput);
    window.removeEventListener('mousedown', onUserInput);
  };

  initialTimer = window.setTimeout(scrollOnce, INITIAL_DELAY_MS);

  let lastHeight = 0;
  const ro = new ResizeObserver(([entry]) => {
    if (cancelled) return;
    const h = entry.contentRect.height;
    if (h === lastHeight) return;
    lastHeight = h;
    scrollOnce();
    if (stableTimer !== undefined) window.clearTimeout(stableTimer);
    stableTimer = window.setTimeout(cleanup, STABLE_MS);
  });
  ro.observe(document.body);

  window.addEventListener('wheel', onUserInput, { passive: true });
  window.addEventListener('touchmove', onUserInput, { passive: true });
  window.addEventListener('touchstart', onUserInput, { passive: true });
  window.addEventListener('keydown', onUserInput);
  window.addEventListener('mousedown', onUserInput);

  hardCapTimer = window.setTimeout(cleanup, HARD_CAP_MS);

  return cleanup;
}

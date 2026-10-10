/** How long after the page is shown again a field is written back once more, in milliseconds: a browser may empty it a moment after saying the page is back. */
const SETTLED_AFTER = 300

/**
 * Has `write` run whenever the page is before the person again after
 * having been away: brought back from the browser's cache, made visible
 * again, or given the focus back. A phone's browser tells of a return in
 * different ways — an app on an iPhone's home screen is never unloaded
 * when it sends a person to another site, only covered, so it is not told
 * the page was shown again at all — so each way is listened for, and
 * `write` must be safe to run when nothing changed. Gives back what stops
 * the listening.
 */
export const onShownAgain = (write: () => void): (() => void) => {
  const back = (): void => {
    write()
    setTimeout(write, SETTLED_AFTER)
  }
  const seen = (): void => {
    if (document.visibilityState === "visible") back()
  }
  window.addEventListener("pageshow", back)
  window.addEventListener("focus", back)
  document.addEventListener("visibilitychange", seen)
  return () => {
    window.removeEventListener("pageshow", back)
    window.removeEventListener("focus", back)
    document.removeEventListener("visibilitychange", seen)
  }
}

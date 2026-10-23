/**
 * Whether the app was opened from the home screen, where no address bar
 * shows: as the manifest asks (`standalone`), or full screen; and on iOS,
 * which says so of its own.
 */
export const isInstalled = (): boolean =>
  window.matchMedia("(display-mode: standalone)").matches || window.matchMedia("(display-mode: fullscreen)").matches || ("standalone" in navigator && navigator.standalone === true)

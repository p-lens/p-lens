import { toast } from "./toast"

/** Whether the browser knows itself offline: a page left for then would be the browser's own error, and what was typed here lost with it. */
const knownOffline = (): boolean => navigator.onLine === false

/**
 * Leaves the app for another page, where the device can: known offline,
 * it stays, and says why, rather than going to the browser's error page
 * and losing what was typed.
 */
export const leaveFor = (address: string, offlineWords: string): void => {
  if (knownOffline()) {
    toast({ title: offlineWords, tone: "error" })
    return
  }
  window.location.assign(address)
}

/** Keeps a link from being followed while the device is known offline, and says why. */
export const stayWhileOffline = (event: MouseEvent, offlineWords: string): void => {
  if (!knownOffline()) return
  event.preventDefault()
  toast({ title: offlineWords, tone: "error" })
}

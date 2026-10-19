import type { WelcomeStore } from "../port/welcome-store"

const FIRST_OPENED = "p-lens.first-opened"
const WELCOMED = "p-lens.welcomed"

/** What welcomed is kept as; anything else, or nothing, is not yet. */
const ON = "on"

/** localStorage may be absent or refuse; neither stops the app, which then goes by what it holds. */
const stored = (key: string): string | undefined => {
  try {
    return localStorage.getItem(key) ?? undefined
  } catch {
    return undefined
  }
}

const keep = (key: string, value: string): void => {
  try {
    localStorage.setItem(key, value)
  } catch {
    return
  }
}

/** A first opening as kept, or none where nothing, or nothing that is a time, is kept. */
const firstOpenedOf = (kept: string | undefined): number | undefined => (kept !== undefined && /^\d+$/.test(kept) ? Number(kept) : undefined)

/**
 * A device's arrival kept in localStorage. When it first opened the app is
 * written as the store is made, at the app's start, where nothing is kept
 * yet — ahead of anything that reads it, so a device opened before the
 * welcome came to be is told from a new one. Where storage refuses, both
 * still hold for as long as the page is open.
 */
export const createLocalStorageWelcomeStore = (now: () => number): WelcomeStore => {
  const firstOpened = firstOpenedOf(stored(FIRST_OPENED)) ?? now()
  keep(FIRST_OPENED, String(firstOpened))
  const held: { welcomed: boolean } = { welcomed: stored(WELCOMED) === ON }
  return {
    firstOpened: () => firstOpened,
    welcomed: () => held.welcomed,
    setWelcomed: () => {
      held.welcomed = true
      keep(WELCOMED, ON)
    },
  }
}

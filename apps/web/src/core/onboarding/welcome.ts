/**
 * When the welcome came to be offered, in UNIX seconds: a device first
 * opened before it was in use already, whatever it holds, and is not
 * greeted as new.
 */
const WELCOME_SINCE = 1792424447

/** What says whether a device is new to the app: when it first opened it, whether it has been welcomed, and whether it holds anything a person put in it. */
export interface Arrival {
  readonly firstOpened: number
  readonly welcomed: boolean
  readonly holdsAnything: boolean
}

/**
 * Whether a device is welcomed as it opens: only once, only a device first
 * opened since the welcome came to be, and only while it holds nothing a
 * person put in it — the first book every device is given is nothing, and
 * a device that joined a person's books by sync is not new to them.
 */
export const welcomeDue = (arrival: Arrival): boolean => !arrival.welcomed && arrival.firstOpened >= WELCOME_SINCE && !arrival.holdsAnything

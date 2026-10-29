import { createSignal, type Accessor } from "solid-js"

const STORAGE_KEY = "p-lens.mummer"

const MUMMED_ON_KEY = "p-lens.mummed-on"

const KEPT_PLAIN_ON_KEY = "p-lens.kept-plain-on"

/** localStorage may be absent or refuse; neither is a reason to fail to draw. */
const read = (key: string): string | undefined => {
  try {
    return localStorage.getItem(key) ?? undefined
  } catch {
    return undefined
  }
}

const write = (key: string, value: string | undefined): void => {
  try {
    if (value === undefined) localStorage.removeItem(key)
    else localStorage.setItem(key, value)
  } catch {
    return
  }
}

/**
 * Whether the device is mumming: kept on the device, so that loading the
 * page again in the middle of a stream never shows what was veiled. It is
 * a `p-lens.` key, so emptying the device takes it too.
 */
const [mumming, setMumming] = createSignal(read(STORAGE_KEY) === "on")

/**
 * The business day mumming was last on — turned on, or turned off having
 * been on, whichever day it was turned on — as the device's turn put it
 * then: kept beside it, a `p-lens.` key as well, so that the plain label
 * outlives a reload and goes with the device's data.
 */
const [mummedOn, setMummedOn] = createSignal(read(MUMMED_ON_KEY))

/** The business day the plain label was cleared on while mumming, so that turning mumming off that day leaves none: a `p-lens.` key too. */
const [keptPlainOn, setKeptPlainOn] = createSignal(read(KEPT_PLAIN_ON_KEY))

const markMummedOn = (businessDay: string | undefined): void => {
  setMummedOn(businessDay)
  write(MUMMED_ON_KEY, businessDay)
}

const markKeptPlainOn = (businessDay: string | undefined): void => {
  setKeptPlainOn(businessDay)
  write(KEPT_PLAIN_ON_KEY, businessDay)
}

export const isMumming: Accessor<boolean> = mumming

/** Begin mumming, from now and on this device's later visits, marking the business day it was begun on; a label cleared before it comes back once it is turned off again. */
export const startMumming = (businessDay: string): void => {
  setMumming(true)
  write(STORAGE_KEY, "on")
  markMummedOn(businessDay)
  markKeptPlainOn(undefined)
}

/**
 * End mumming, from now and on this device's later visits, marking the
 * business day it ends on as one it was on — mumming carried over from an
 * earlier day was on this one too — unless the plain label was cleared
 * while mumming that day.
 */
export const stopMumming = (businessDay: string): void => {
  const wasMumming = mumming()
  setMumming(false)
  write(STORAGE_KEY, undefined)
  if (wasMumming && keptPlainOn() !== businessDay) markMummedOn(businessDay)
}

/**
 * Whether the plain label stands in the top bar: only while not mumming,
 * and only on the business day mumming was last turned on, so that one
 * who mummed today can go back in a press, and one who did not sees
 * nothing. The business day turning takes it away.
 */
export const plainLabelShown = (state: { readonly mumming: boolean; readonly mummedOn: string | undefined }, businessDay: string): boolean => !state.mumming && state.mummedOn === businessDay

/** Whether the plain label stands now, on the business day given. */
export const isPlainLabelShown = (businessDay: string): boolean => plainLabelShown({ mumming: mumming(), mummedOn: mummedOn() }, businessDay)

/** What clearing the plain label came to: taken away; not to come when mumming is turned off, cleared while mumming; or there was none to take. */
export type PlainLabelCleared = "cleared" | "kept-off" | "not-shown"

/**
 * Take the plain label away before the business day turns, by forgetting
 * the day mumming was on; mumming again that day brings it back. Cleared
 * while mumming, turning mumming off that day leaves none. Where it is
 * neither shown nor to come, nothing is changed.
 */
export const clearPlainLabel = (businessDay: string): PlainLabelCleared => {
  if (mumming()) {
    markMummedOn(undefined)
    markKeptPlainOn(businessDay)
    return "kept-off"
  }
  if (!isPlainLabelShown(businessDay)) return "not-shown"
  markMummedOn(undefined)
  return "cleared"
}

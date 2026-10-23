import { createSignal, type Accessor } from "solid-js"

const STORAGE_KEY = "p-lens.mummer"

/** localStorage may be absent or refuse; neither is a reason to fail to draw. */
const stored = (): boolean => {
  try {
    return localStorage.getItem(STORAGE_KEY) === "on"
  } catch {
    return false
  }
}

const keep = (on: boolean): void => {
  try {
    if (on) localStorage.setItem(STORAGE_KEY, "on")
    else localStorage.removeItem(STORAGE_KEY)
  } catch {
    return
  }
}

/**
 * Whether the device is mumming: kept on the device, so that loading the
 * page again in the middle of a stream never shows what was veiled. It is
 * a `p-lens.` key, so emptying the device takes it too.
 */
const [mumming, setMumming] = createSignal(stored())

export const isMumming: Accessor<boolean> = mumming

/** Begin or end mumming, from now and on this device's later visits. */
export const turnMumming = (on: boolean): void => {
  setMumming(on)
  keep(on)
}

import { createSignal, type Accessor } from "solid-js"

/** The day a calendar's week begins on: Sunday, until the person says Monday. */
export type WeekStart = "sunday" | "monday"

export const WEEK_STARTS: readonly WeekStart[] = ["sunday", "monday"]

export const DEFAULT_WEEK_START: WeekStart = "sunday"

export const readWeekStart = (stored: string | undefined): WeekStart => WEEK_STARTS.find((start) => start === stored) ?? DEFAULT_WEEK_START

const STORAGE_KEY = "p-lens.week-start"

/** localStorage may be absent or refuse; neither is a reason to fail to draw. */
const storedStart = (): string | undefined => {
  try {
    return localStorage.getItem(STORAGE_KEY) ?? undefined
  } catch {
    return undefined
  }
}

const keepStart = (start: WeekStart): void => {
  try {
    localStorage.setItem(STORAGE_KEY, start)
  } catch {
    return
  }
}

const [start, setStart] = createSignal<WeekStart>(readWeekStart(storedStart()))

/** The day the calendars' weeks begin on: how the app looks, so kept on the device beside the theme. */
export const weekStart: Accessor<WeekStart> = start

/** Begin the calendars' weeks on this day, from now and on this device's later visits. */
export const chooseWeekStart = (chosen: WeekStart): void => {
  setStart(chosen)
  keepStart(chosen)
}

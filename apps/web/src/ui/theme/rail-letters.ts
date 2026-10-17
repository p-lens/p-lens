import { createSignal, type Accessor } from "solid-js"

/** How many characters of a book's name stand for it on the rail: one, until the person says two, three or four. */
export type RailLetters = 1 | 2 | 3 | 4

export const RAIL_LETTERS: readonly RailLetters[] = [1, 2, 3, 4]

export const DEFAULT_RAIL_LETTERS: RailLetters = 1

export const readRailLetters = (stored: string | undefined): RailLetters => RAIL_LETTERS.find((letters) => String(letters) === stored) ?? DEFAULT_RAIL_LETTERS

const STORAGE_KEY = "p-lens.rail-letters"

/** localStorage may be absent or refuse; neither is a reason to fail to draw. */
const storedLetters = (): string | undefined => {
  try {
    return localStorage.getItem(STORAGE_KEY) ?? undefined
  } catch {
    return undefined
  }
}

const keepLetters = (letters: RailLetters): void => {
  try {
    localStorage.setItem(STORAGE_KEY, String(letters))
  } catch {
    return
  }
}

const [letters, setLetters] = createSignal<RailLetters>(readRailLetters(storedLetters()))

/** The characters a book is shown by on the rail: how the app looks, so kept on the device beside the theme. */
export const railLetters: Accessor<RailLetters> = letters

/** Show a book by this many characters, from now and on this device's later visits. */
export const chooseRailLetters = (chosen: RailLetters): void => {
  setLetters(chosen)
  keepLetters(chosen)
}

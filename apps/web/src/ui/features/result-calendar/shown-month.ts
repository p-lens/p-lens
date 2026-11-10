import type { IsoMonth } from "../../../core/calendar/calendar"

/**
 * The month each calendar last showed, by whose results it shows — a book,
 * or the books consolidated — for as long as the page is open: a calendar
 * opened again, as a person comes back from a day's tallies, shows the month
 * they left it on rather than today's. Kept on the page alone, never on the
 * device, so a page opened afresh shows today's month.
 */
export interface ShownMonths {
  readonly of: (key: string) => IsoMonth | undefined
  readonly keep: (key: string, month: IsoMonth) => void
}

export const createShownMonths = (): ShownMonths => {
  const held = new Map<string, IsoMonth>()
  return {
    of: (key) => held.get(key),
    keep: (key, month) => void held.set(key, month),
  }
}

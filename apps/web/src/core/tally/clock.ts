import type { Entry } from "../journal/entry"
import { TALLY_TAGS, type ClockTime, type PlayClock } from "./tally"

const twoDigits = (value: number): string => String(value).padStart(2, "0")

/** A time as a book writes it: `09:05`. */
export const clockText = (time: ClockTime): string => `${twoDigits(time.hour)}:${twoDigits(time.minute)}`

const CLOCK = /^(\d{1,2}):(\d{2})$/

/** A time a book wrote, or none where the text is not one. */
export const readClockText = (text: string | undefined): ClockTime | undefined => {
  const found = text === undefined ? null : CLOCK.exec(text.trim())
  if (found === null) return undefined
  const hour = Number(found[1])
  const minute = Number(found[2])
  return hour < 24 && minute < 60 ? { hour, minute } : undefined
}

/** What an entry says of when its play began and finished, each where it was said. */
export const clockTags = (clock: PlayClock | undefined): Entry["tags"] => [
  ...(clock?.started === undefined ? [] : [[TALLY_TAGS.started, clockText(clock.started)] as const]),
  ...(clock?.finished === undefined ? [] : [[TALLY_TAGS.finished, clockText(clock.finished)] as const]),
]

/** The clock two times make, either left unsaid: none where neither is said. */
export const clockFrom = (started: ClockTime | undefined, finished: ClockTime | undefined): PlayClock | undefined =>
  started === undefined && finished === undefined ? undefined : { started, finished }

/** A tally's clock as its entry's tags say it: none where they say neither time. */
export const clockOf = (tagged: (name: string) => string | undefined): PlayClock | undefined =>
  clockFrom(readClockText(tagged(TALLY_TAGS.started)), readClockText(tagged(TALLY_TAGS.finished)))

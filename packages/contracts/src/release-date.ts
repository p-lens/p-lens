/**
 * When a machine can have come out. Pachinko and pachislot machines as they
 * are kept here begin long after this; a date before it is a typing slip.
 * It is the first day a UNIX time holds, so that every release date can
 * become one — and a UUIDv7, whose moment is one.
 */
export const EARLIEST_RELEASE = "1970-01-01"

/**
 * How far ahead of today a release date may be. A machine is announced and
 * registered months before it reaches parlors, never years.
 */
export const RELEASE_DAYS_AHEAD = 366

/** Why a release date, a real calendar day, cannot be a machine's. */
export type ReleaseDateProblem = "too-early" | "too-far-ahead"

const MILLISECONDS_A_DAY = 86_400_000

const daysAfter = (day: string, days: number): string => new Date(Date.parse(`${day}T00:00:00Z`) + days * MILLISECONDS_A_DAY).toISOString().slice(0, 10)

/** Whether a day, YYYY-MM-DD, can be a machine's release date as of today, YYYY-MM-DD; both sides check it the same way. */
export const releaseDateProblem = (day: string, today: string): ReleaseDateProblem | undefined => {
  if (day < EARLIEST_RELEASE) return "too-early"
  return day > daysAfter(today, RELEASE_DAYS_AHEAD) ? "too-far-ahead" : undefined
}

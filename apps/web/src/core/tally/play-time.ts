import { SECONDS } from "../commodity/commodity"
import { decimal, multiply, rounded, type Decimal } from "../decimal/decimal"
import { ACCOUNTS } from "../journal/accounts"
import type { Entry, Posting } from "../journal/entry"
import type { PlayClock } from "./tally"

/** Minutes in a day: a play finishing at an earlier time than it began finished on the day after. */
const DAY_MINUTES = 24 * 60

/** Minutes in an hour, and seconds in a minute. */
const SIXTY = decimal(60n, 0)

/** The minutes from a play's start to its finish, by the clock: none where either is unsaid, or both are one time. */
const clockMinutes = (clock: PlayClock | undefined): number | undefined => {
  if (clock?.started === undefined || clock.finished === undefined) return undefined
  const minutes = (clock.finished.hour * 60 + clock.finished.minute - (clock.started.hour * 60 + clock.started.minute) + DAY_MINUTES) % DAY_MINUTES
  return minutes === 0 ? undefined : minutes
}

/**
 * The seconds a tally's play lasted: by its clock where both its start and
 * its finish are said, else by the hours told of it, to the nearest whole
 * minute; none where neither says. Hours are kept to a hundredth, which is
 * 36 seconds — 5時間20分 is 5.33 — so the nearest minute is the one told,
 * where the seconds themselves would be 19,188 for 19,200.
 */
export const playSecondsOf = (clock: PlayClock | undefined, hours: Decimal | undefined): Decimal | undefined => {
  const minutes = clockMinutes(clock)
  if (minutes !== undefined) return decimal(BigInt(minutes * 60), 0)
  return hours === undefined ? undefined : multiply(rounded(multiply(hours, SIXTY), 0), SIXTY)
}

/** A play's time, in seconds, as a posting of statistics beside its tally: virtual, so it balances nothing. */
export const playTimePosting = (seconds: Decimal): Posting => ({
  account: ACCOUNTS.playTime,
  amount: { quantity: seconds, commodity: SECONDS },
  kind: "virtual",
})

const declares = (accounts: string, line: string): boolean => accounts.split("\n").some((each) => each.trim() === line)

/**
 * A book's accounts as an entry needs them: the seconds a play's time is
 * kept in and its account declared, where the entry posts to it and the
 * book has not got them — a book made before play time was kept has
 * neither — and as they were otherwise.
 */
export const withPlayTimeDeclaredFor = (accounts: string, entry: Entry): string => {
  if (!entry.postings.some((posting) => posting.account === ACCOUNTS.playTime)) return accounts
  return [`commodity 1. ${SECONDS}`, `account ${ACCOUNTS.playTime}`].reduce((declared, line) => (declares(declared, line) ? declared : `${declared.replace(/\n*$/, "")}\n${line}\n`), accounts)
}

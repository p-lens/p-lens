import { RANDOM_BYTES, formatUuidV7, retimeUuidV7, type UuidV7 } from "@p-lens/uuidv7"

import type { IsoDate } from "../../core/calendar/calendar"

/**
 * A fresh UUIDv7 from this device's clock and random source.
 *
 * The only failure `formatUuidV7` knows is a clock before 1970 or past the
 * year 10889, which no running browser has; reaching it is a broken
 * environment, said at once rather than carried as an id that is not one.
 */
export const freshUuidV7 = (): UuidV7 => {
  const made = formatUuidV7(Date.now(), crypto.getRandomValues(new Uint8Array(RANDOM_BYTES)))
  if (!made.ok) throw new Error(`the clock cannot make a UUIDv7: ${made.error.type}`)
  return made.value
}

/**
 * A UUIDv7 moved into a day, so that what it names sorts among the others
 * of that day's by its name alone. The moment is the day's midnight in UTC,
 * which is nine in the morning in Japan: about when a parlor opens, inside
 * the business day that turns over at five, and the same on every device
 * whatever its clock is set to. A day no UUIDv7 can hold — before 1970 —
 * leaves the id as it was made.
 */
export const uuidV7On = (fresh: UuidV7, date: IsoDate): UuidV7 => {
  const moved = retimeUuidV7(fresh, Date.parse(`${date}T00:00:00Z`))
  return moved.ok ? moved.value : fresh
}

/**
 * The name a member of a book is counted under in the shared catalog: a
 * UUIDv7 in shape, since that is what the catalog takes a voter's name to
 * be, made of a digest of the book and the member and of no moment. The
 * same book and member give the same name on every device, and the name
 * gives back neither.
 */
export const voterOf = async (bookId: string, member: string): Promise<string> => {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${bookId}\n${member}`)))
  const made = formatUuidV7(0, digest.slice(0, RANDOM_BYTES))
  if (!made.ok) throw new Error(`a digest cannot make a UUIDv7: ${made.error.type}`)
  return made.value
}

/** A fresh 64-bit simulation seed, as decimal text. */
export const freshSeed = (): string => crypto.getRandomValues(new BigUint64Array(1))[0]?.toString() ?? "0"

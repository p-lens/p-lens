import { parseIsoDate, type IsoDate } from "../calendar/calendar"

/**
 * A huddle (ノリ打ち): people playing together, each shown the others'
 * plays as they go. It is no book's, and writes in none: each play is
 * still recorded wherever its player records it. One line on the relay
 * carries it, drawn from a secret that its QR code is all of, so
 * whoever reads the code may read and add to the line, and nobody else.
 * It lasts the business day it was joined on.
 */
export interface Huddle {
  readonly secret: string
  readonly businessDay: IsoDate
  /** This device in the huddle: what its plays go by, so that each person is one card however they are called. */
  readonly member: string
  /** What this person is called in the huddle, as they said. */
  readonly name: string
  /** The others' plays this device let go of from its own list, each a member and a play's id (`huddlePlayKey`): theirs to keep, gone from here alone. */
  readonly dismissed: readonly string[]
}

/** One of the others' plays as the device names it: who showed it, and its id. */
export const huddlePlayKey = (member: string, playId: string): string => `${member} ${playId}`

/** The longest a name in a huddle may be: a card's heading, on a phone. */
export const HUDDLE_NAME_LENGTH = 12

/** What a huddle's code begins with: no book's code or invitation does, so neither is ever taken for the other. */
const CODE = "p-lens-huddle:1:"

/** A secret as it is written: 32 bytes in base64url, 43 characters. */
const SECRET = /^[A-Za-z0-9_-]{43}$/

/** What a huddle's QR code carries: its secret, marked as a huddle's. */
export const huddleCodeOf = (huddle: Huddle): string => `${CODE}${huddle.secret}`

/** The secret a code carries, if it is a huddle's, however it was read or pasted. */
export const secretOfHuddleCode = (code: string): string | undefined => {
  const written = code.trim()
  const secret = written.slice(CODE.length)
  return written.startsWith(CODE) && SECRET.test(secret) ? secret : undefined
}

/** A name as a huddle takes it: its spaces at either end let go, and no longer than a card has room for; none where nothing is left. */
export const huddleNameOf = (typed: string): string | undefined => {
  const name = [...typed.trim()].slice(0, HUDDLE_NAME_LENGTH).join("")
  return name === "" ? undefined : name
}

/** The huddle a device is in on a business day: the one it joined that day, and none once the day has turned. */
export const huddleOn = (huddle: Huddle | undefined, businessDay: IsoDate): Huddle | undefined => (huddle?.businessDay === businessDay ? huddle : undefined)

/** A huddle as the device keeps it. */
export const huddleText = (huddle: Huddle): string => JSON.stringify(huddle)

const isText = (value: unknown): value is string => typeof value === "string"

/** What was let go of, as kept: none where a device kept no list, as one that joined before any could be. */
const dismissedOf = (kept: unknown): readonly string[] | undefined => (kept === undefined ? [] : Array.isArray(kept) && kept.every(isText) ? kept : undefined)

/** A huddle read back from what the device kept, or none where it is not one. */
export const readHuddle = (written: string | undefined): Huddle | undefined => {
  if (written === undefined) return undefined
  try {
    const kept: unknown = JSON.parse(written)
    if (typeof kept !== "object" || kept === null) return undefined
    const { secret, businessDay, member, name, dismissed } = kept as Readonly<Record<string, unknown>>
    const day = isText(businessDay) ? parseIsoDate(businessDay) : undefined
    const letGo = dismissedOf(dismissed)
    return isText(secret) && SECRET.test(secret) && day?.ok === true && isText(member) && member !== "" && isText(name) && huddleNameOf(name) === name && letGo !== undefined
      ? { secret, businessDay: day.value, member, name, dismissed: letGo }
      : undefined
  } catch {
    return undefined
  }
}

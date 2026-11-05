import { parseIsoDate, type IsoDate } from "../calendar/calendar"

/**
 * A huddle (ノリ打ち): people playing together, each shown the others'
 * plays as they go. It is no book's, and writes in none: each play is
 * still recorded wherever its player records it. One line on a relay
 * carries it, drawn from a secret its QR code carries with the business day
 * and the relay's address, so whoever reads the code may read and add to
 * the line, and nobody else. It lasts the business day it was begun on. A
 * device that left it keeps it that day, as left, so that the same code
 * read again makes it the same member it was.
 */
export interface Huddle {
  /** The huddle's secret, 32 bytes in base64url. */
  readonly secret: string
  readonly businessDay: IsoDate
  /** The address of the relay its line is at, its label included where the relay gives lines labels. */
  readonly relay: string
  /** What this device's key in the huddle is drawn from with the secret, 32 bytes in base64url: kept, so that the same code read again draws the same key. */
  readonly seed: string
  /** This device in the huddle: the public key it signs with there, so that each person is one card however they are called, and nobody shows a play as another. */
  readonly member: string
  /** What this person is called in the huddle, as they said. */
  readonly name: string
  /** The others' plays this device let go of from its own list, each a member and a play's id (`huddlePlayKey`): theirs to keep, gone from here alone. */
  readonly dismissed: readonly string[]
  /** Whether this device left it: it shows and is shown nothing until it joins again. */
  readonly left?: true
}

/** One of the others' plays as the device names it: who showed it, and its id. */
export const huddlePlayKey = (member: string, playId: string): string => `${member} ${playId}`

/** The longest a name in a huddle may be: a card's heading, on a phone. */
export const HUDDLE_NAME_LENGTH = 12

/** A secret or a seed as it is written: 32 bytes in base64url, 43 characters. */
const SECRET = /^[A-Za-z0-9_-]{43}$/

const MEMBER = /^[0-9a-f]{64}$/

const RELAY = /^wss?:\/\/[^\s]+$/

/** A name as a huddle takes it: its spaces at either end let go, and no longer than a card has room for; none where nothing is left. */
export const huddleNameOf = (typed: string): string | undefined => {
  const name = [...typed.trim()].slice(0, HUDDLE_NAME_LENGTH).join("")
  return name === "" ? undefined : name
}

/** The huddle a device joined on a business day, left since or not, and none once the day has turned. */
export const huddleOn = (huddle: Huddle | undefined, businessDay: IsoDate): Huddle | undefined => (huddle?.businessDay === businessDay ? huddle : undefined)

/** The huddle a device is in on a business day: the one it joined that day and has not left. */
export const huddleInOn = (huddle: Huddle | undefined, businessDay: IsoDate): Huddle | undefined => ((found) => (found?.left === true ? undefined : found))(huddleOn(huddle, businessDay))

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
    const { secret, businessDay, relay, seed, member, name, dismissed, left } = kept as Readonly<Record<string, unknown>>
    const day = isText(businessDay) ? parseIsoDate(businessDay) : undefined
    const letGo = dismissedOf(dismissed)
    const wellFormed =
      isText(secret) && SECRET.test(secret) && isText(seed) && SECRET.test(seed) && isText(relay) && RELAY.test(relay) && isText(member) && MEMBER.test(member)
    return wellFormed && day?.ok === true && isText(name) && huddleNameOf(name) === name && letGo !== undefined && (left === undefined || left === true)
      ? { secret, businessDay: day.value, relay, seed, member, name, dismissed: letGo, ...(left === true ? { left } : {}) }
      : undefined
  } catch {
    return undefined
  }
}

import { parseIsoDate, type IsoDate } from "../../core/calendar/calendar"
import type { Huddle } from "../../core/huddle/huddle"
import { huddleEntryText, readHuddleEntry, type HuddleEntry } from "../../core/huddle/post"
import { NAMES } from "./keyring"

/** What a huddle's code carries: its secret, the business day it is of, and the relay address its line is at. */
export type HuddleCode = { readonly secret: string; readonly day: IsoDate; readonly relay: string }

/** What a huddle's code begins with: no book's code or invitation does, so neither is ever taken for the other. */
const CODE = "p-lens-huddle:2:"

/** A secret as it is written: 32 bytes in base64url, 43 characters. */
const SECRET = /^[A-Za-z0-9_-]{43}$/

const RELAY = /^wss?:\/\/[^\s]+$/

/** What a huddle's QR code carries (PROTOCOL.md §8): shown as a QR code, never as text to copy. */
export const huddleCodeOf = (huddle: Pick<Huddle, "secret" | "businessDay" | "relay">): string => `${CODE}${huddle.secret}:${huddle.businessDay}:${huddle.relay}`

/** What a code carries, if it is a huddle's, however it was read. */
export const readHuddleCode = (text: string): HuddleCode | undefined => {
  const written = text.trim()
  if (!written.startsWith(CODE)) return undefined
  const [secret, day, ...relay] = written.slice(CODE.length).split(":")
  const parsedDay = day === undefined ? undefined : parseIsoDate(day)
  const address = relay.join(":")
  return secret !== undefined && SECRET.test(secret) && parsedDay?.ok === true && RELAY.test(address) ? { secret, day: parsedDay.value, relay: address } : undefined
}

/**
 * When a huddle's states may be let go of by the relay: two whole UTC days
 * after its business day begins, rounded to a day as PROTOCOL.md §1.2 asks,
 * so that the hour a business day turns is told to nobody.
 */
export const huddleExpiration = (day: IsoDate): number => {
  const [year, month, date] = day.split("-").map(Number) as [number, number, number]
  return Date.UTC(year, month - 1, date + 2) / 1000
}

/** The name of the address an entry is kept at: a play's showing and its taking back share one; a member's leaving has its own. */
export const addressNameOf = (entry: HuddleEntry): string => {
  if ("play" in entry) return NAMES.huddlePlay(entry.play.id)
  if ("withdrawn" in entry) return NAMES.huddlePlay(entry.withdrawn)
  return NAMES.huddleWord
}

/** An entry as it is sealed. */
export const stateOf = (entry: HuddleEntry): unknown => JSON.parse(huddleEntryText(entry))

/**
 * An entry read from a state its author sealed: it holds only where it says
 * it is the author's own, so that nobody shows, takes back or leaves for
 * another, the relay having checked the author's signature already.
 */
export const entryOfState = (author: string, state: unknown): HuddleEntry | undefined => {
  const entry = readHuddleEntry(JSON.stringify(state))
  return entry?.member === author ? entry : undefined
}

/** The least time between two showings of one play, by how many are in the room (PROTOCOL.md §8): a room of thirty asked as often as one of three would crowd every phone in it. */
export const showingEvery = (members: number): number => (members <= 6 ? 3_000 : members <= 20 ? 10_000 : 30_000)

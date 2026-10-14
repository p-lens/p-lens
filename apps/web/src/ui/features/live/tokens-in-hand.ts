import type { IsoDate } from "../../../core/calendar/calendar"
import { toPlainString } from "../../../core/decimal/decimal"
import type { PlayVenue } from "../../../core/live-play/draft"
import { sameIdentity, samePool, type ParlorIdentity, type SavingsPool } from "../../../core/parlor/parlor"
import { poolOf } from "../../../core/parlor/terms"
import type { TokenTally } from "../../../core/tally/tally"
import type { PlayGameKind, PlayId } from "../../../core/play/play"
import { tidyTyped } from "../../../core/text/tidy"

/**
 * The tokens a person has in hand between two plays of a day: what the
 * play just recorded left, at its parlor and of its pool, to be what the
 * day's next play there is begun with. They are in hand only at that
 * parlor, of that pool and on that business day; `from` is the play that
 * left them, so that recording it again changes what it left and no other
 * play's. A play at no parlor is at a place of its own — no identity —
 * and its tokens are in hand for the next play at no parlor: a person
 * trying the app out names none, and is carried on all the same.
 */
export interface TokensInHand {
  readonly identity: ParlorIdentity | undefined
  readonly pool: SavingsPool
  readonly count: number
  readonly from: PlayId
}

/** Tokens in hand as they are kept: with the business day they were left on. */
export const writtenTokensInHand = (day: IsoDate, inHand: TokensInHand): string => JSON.stringify({ day, ...inHand })

const samePlace = (left: ParlorIdentity | undefined, right: ParlorIdentity | undefined): boolean => (left === undefined || right === undefined ? left === right : sameIdentity(left, right))

/** Where a play about to start is, as tokens are in hand there: its parlor and the pool its terms make, or no parlor and that pool; nowhere for a play with no terms, which counts no tokens. */
const placeOf = (venue: PlayVenue, gameKind: PlayGameKind): { readonly identity: ParlorIdentity | undefined; readonly pool: SavingsPool } | undefined => {
  if (venue.type === "parlor") return { identity: venue.parlor.identity, pool: poolOf(gameKind, venue.terms) }
  return venue.terms === undefined ? undefined : { identity: undefined, pool: poolOf(gameKind, venue.terms) }
}

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> => typeof value === "object" && value !== null && !Array.isArray(value)

const identityOf = (value: unknown): ParlorIdentity | undefined => {
  if (!isRecord(value)) return undefined
  if (value["type"] === "listed" && typeof value["id"] === "string") return { type: "listed", id: value["id"] as never }
  if (value["type"] === "submitted" && typeof value["submission"] === "string") return { type: "submitted", submission: value["submission"] as never }
  return undefined
}

const poolIn = (value: unknown): SavingsPool | undefined =>
  isRecord(value) && (value["kind"] === "ball" || value["kind"] === "medal") && typeof value["tier"] === "string" ? { kind: value["kind"], tier: value["tier"] } : undefined

const inHandOf = (kept: Readonly<Record<string, unknown>>): TokensInHand | undefined => {
  const identity = identityOf(kept["identity"])
  const pool = poolIn(kept["pool"])
  const { count, from } = kept
  return (identity === undefined && kept["identity"] !== undefined) || pool === undefined || typeof count !== "number" || !Number.isInteger(count) || count <= 0 || typeof from !== "string" ? undefined : { identity, pool, count, from: from as PlayId }
}

/** What is kept of the tokens in hand on a day: none, those left on it, or something kept that does not read. */
export type RecalledTokens = { readonly type: "none" } | { readonly type: "kept"; readonly inHand: TokensInHand } | { readonly type: "unreadable" }

const parsed = (written: string): unknown => {
  try {
    return JSON.parse(written)
  } catch {
    return undefined
  }
}

/** The tokens in hand kept, if they were left on this business day: yesterday's were exchanged or saved overnight, and are none today. */
export const recalledTokensInHand = (written: string | undefined, day: IsoDate): RecalledTokens => {
  if (written === undefined) return { type: "none" }
  const kept = parsed(written)
  if (!isRecord(kept) || typeof kept["day"] !== "string") return { type: "unreadable" }
  if (kept["day"] !== day) return { type: "none" }
  const inHand = inHandOf(kept)
  return inHand === undefined ? { type: "unreadable" } : { type: "kept", inHand }
}

/** Whether what is kept of the tokens in hand is there and does not read, so that the person is told, and types them in. */
export const tokensInHandUnreadable = (written: string | undefined, day: IsoDate): boolean => recalledTokensInHand(written, day).type === "unreadable"

/** What is kept as it is to stay kept on a day: itself while it is that day's, or while it does not read and is still to be told of, and nothing once the day has turned over, so that it is let go of then, whatever the book says. */
export const tokensStillInHand = (written: string | undefined, day: IsoDate): string | undefined => (recalledTokensInHand(written, day).type === "none" ? undefined : written)

/** The tokens a play about to start at this venue is begun with in hand: those kept, where they were left at its parlor — or at none, as it is — and are of its pool. */
export const tokensCarriedTo = (written: string | undefined, day: IsoDate, venue: PlayVenue, gameKind: PlayGameKind): number | undefined => {
  const recalled = recalledTokensInHand(written, day)
  const place = placeOf(venue, gameKind)
  return recalled.type === "kept" && place !== undefined && samePlace(recalled.inHand.identity, place.identity) && samePool(recalled.inHand.pool, place.pool) ? recalled.inHand.count : undefined
}

/** What the start form shows of the tokens a play is begun with: what was typed over it, or — left as it was — what is kept for the place. */
export const carriedInShown = (typed: string | undefined, kept: number | undefined): string => typed ?? (kept === undefined ? "" : String(kept))

const COUNT = /^\d+$/

/** The tokens the start form says a play is begun with: none where left empty or at zero, unread where what is typed is no count. */
export const readCarriedIn = (shown: string): { readonly type: "none" } | { readonly type: "count"; readonly count: number } | { readonly type: "unread" } => {
  const plain = tidyTyped(shown).replaceAll(",", "")
  if (plain === "") return { type: "none" }
  if (!COUNT.test(plain)) return { type: "unread" }
  return Number(plain) === 0 ? { type: "none" } : { type: "count", count: Number(plain) }
}

/** What a play recorded left in hand, and where: the tokens counted as it finished, at the venue it was played at. Nothing for a play with no terms. */
export const leftAt = (venue: PlayVenue, gameKind: PlayGameKind, date: IsoDate, count: number): TokensLeft | undefined => {
  const place = placeOf(venue, gameKind)
  return place === undefined ? undefined : { ...place, date, count }
}

/** The tokens a recorded play left: so many, at a place, on the day it was played. */
export interface TokensLeft {
  readonly identity: ParlorIdentity | undefined
  readonly pool: SavingsPool
  readonly date: IsoDate
  readonly count: number
}

/**
 * What is kept once a play is recorded: what it left, for the day's next
 * play at its parlor. A play recorded again changes only what it left
 * itself — where a later play has begun with those tokens, or left its
 * own, they are no longer this play's to say — and a play of another day
 * leaves nothing in hand today. A play that left nothing leaves nothing
 * kept.
 */
export const tokensKeptAfter = (written: string | undefined, day: IsoDate, play: { readonly id: PlayId; readonly recordedBefore: boolean }, left: TokensLeft): string | undefined => {
  const recalled = recalledTokensInHand(written, day)
  if (left.date !== day || (play.recordedBefore && (recalled.type !== "kept" || recalled.inHand.from !== play.id))) return written
  return left.count > 0 ? writtenTokensInHand(day, { identity: left.identity, pool: left.pool, count: left.count, from: play.id }) : undefined
}

/** What a play recorded in tokens left: its payout, at its parlor and of its pool. */
export const leftBy = (record: TokenTally): TokensLeft => ({ identity: record.parlor.identity, pool: record.pool, date: record.date, count: Number(toPlainString(record.payout)) })

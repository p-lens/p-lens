import type { IsoDate } from "../../../core/calendar/calendar"
import { toPlainString } from "../../../core/decimal/decimal"
import type { PlayVenue } from "../../../core/live-play/draft"
import { sameIdentity, samePool, type ParlorIdentity, type SavingsPool } from "../../../core/parlor/parlor"
import { poolOf } from "../../../core/parlor/terms"
import type { PlayGameKind, PlayId, PlayRecord } from "../../../core/play/play"

/**
 * The tokens a person has in hand between two plays of a day: what the
 * play just recorded left, at its parlor and of its pool, to be what the
 * day's next play there is begun with. They are in hand only at that
 * parlor, of that pool and on that business day; `from` is the play that
 * left them, so that recording it again changes what it left and no other
 * play's.
 */
export interface TokensInHand {
  readonly identity: ParlorIdentity
  readonly pool: SavingsPool
  readonly count: number
  readonly from: PlayId
}

/** Tokens in hand as they are kept: with the business day they were left on. */
export const writtenTokensInHand = (day: IsoDate, inHand: TokensInHand): string => JSON.stringify({ day, ...inHand })

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
  return identity === undefined || pool === undefined || typeof count !== "number" || !Number.isInteger(count) || count <= 0 || typeof from !== "string" ? undefined : { identity, pool, count, from: from as PlayId }
}

/** The tokens in hand kept, if they were left on this business day and read as such: yesterday's were exchanged or saved overnight. */
export const recalledTokensInHand = (written: string | undefined, day: IsoDate): TokensInHand | undefined => {
  if (written === undefined) return undefined
  try {
    const kept: unknown = JSON.parse(written)
    return isRecord(kept) && kept["day"] === day ? inHandOf(kept) : undefined
  } catch {
    return undefined
  }
}

/** What is kept as it is to stay kept on a day: itself while it is that day's, and nothing once the day has turned over — or where it does not read — so that it is let go of then, whatever the book says. */
export const tokensStillInHand = (written: string | undefined, day: IsoDate): string | undefined => (recalledTokensInHand(written, day) === undefined ? undefined : written)

/** The tokens a play about to start at this venue is begun with in hand: those kept, where they were left at its parlor and are of its pool. */
export const tokensCarriedTo = (written: string | undefined, day: IsoDate, venue: PlayVenue, gameKind: PlayGameKind): number | undefined => {
  const inHand = recalledTokensInHand(written, day)
  return inHand !== undefined && venue.type === "parlor" && sameIdentity(inHand.identity, venue.parlor.identity) && samePool(inHand.pool, poolOf(gameKind, venue.terms)) ? inHand.count : undefined
}

/**
 * What is kept once a play is recorded: what it left, for the day's next
 * play at its parlor. A play recorded again changes only what it left
 * itself — where a later play has begun with those tokens, or left its
 * own, they are no longer this play's to say — and a play of another day
 * leaves nothing in hand today. A play that left nothing leaves nothing
 * kept.
 */
export const tokensKeptAfter = (written: string | undefined, day: IsoDate, play: { readonly id: PlayId; readonly recordedBefore: boolean }, record: PlayRecord): string | undefined => {
  const kept = recalledTokensInHand(written, day)
  if (record.date !== day || (play.recordedBefore && kept?.from !== play.id)) return written
  const count = Number(toPlainString(record.payout))
  return count > 0 ? writtenTokensInHand(day, { identity: record.parlor.identity, pool: record.pool, count, from: play.id }) : undefined
}

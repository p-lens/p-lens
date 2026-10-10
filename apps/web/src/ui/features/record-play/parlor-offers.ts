import { identityKey, type Parlor, type ParlorId } from "../../../core/parlor/parlor"
import { parlorMatches } from "../../../core/parlor/search"
import { nearestFirst, type NearParlor } from "../../../core/parlor/distance"
import type { Coordinates, ParlorList, SharedParlor } from "../../../core/parlor/shared"
import { searchKeyOf } from "../../../core/text/search-key"
import type { Submission } from "../../../parlors/port/submission-store"
import { parlorNote } from "../../wording/parlor"

/**
 * A parlor a play added by hand may be said to be at: one the book keeps,
 * one on the parlor list, or one this device submitted that the list has
 * not taken yet. Never a name typed: a book's parlors are the list's.
 */
export interface ParlorOffer {
  readonly parlor: Parlor
  /** What a list to choose from says of it beside its name. */
  readonly note: string
  /** The parlor as the list has it, where the list has not placed it on the map: what its position is reported for. */
  readonly unplaced: Pick<SharedParlor, "id" | "name"> | undefined
  readonly matches: (typed: string) => boolean
}

const named = (name: string) => (typed: string) => searchKeyOf(name).includes(searchKeyOf(typed))

/** The book's own parlor where it keeps the one named, so its pools are known; otherwise the parlor as the list names it, with none. */
const kept = (book: readonly Parlor[], parlor: Parlor): Parlor => book.find((candidate) => identityKey(candidate.identity) === identityKey(parlor.identity)) ?? parlor

/** The list's parlors as they are offered: nearest first, each with how far it is, where the device said where it is; as the list orders them where it did not. */
const inOfferOrder = (parlors: readonly SharedParlor[], here: Coordinates | undefined): readonly NearParlor[] =>
  here === undefined ? parlors.map((parlor) => ({ parlor, metres: undefined })) : nearestFirst(parlors, here)

/**
 * Every parlor on offer: the list's, nearest first where the device said
 * where it is, each as the book keeps it where it does; this device's submissions still waiting on the list; then whatever
 * the book keeps that neither names any more.
 */
export const parlorOffers = (book: readonly Parlor[], list: ParlorList, submissions: readonly Submission[], here: Coordinates | undefined): readonly ParlorOffer[] => {
  const listed: readonly ParlorOffer[] = inOfferOrder(list.parlors, here).map(({ parlor: shared, metres }) => ({
    parlor: kept(book, { identity: { type: "listed", id: shared.id as string as ParlorId }, name: shared.name, pools: [] }),
    note: parlorNote(shared, metres),
    unplaced: shared.location === undefined ? { id: shared.id, name: shared.name } : undefined,
    matches: (typed) => parlorMatches(shared, typed),
  }))
  const waiting: readonly ParlorOffer[] = submissions
    .filter((submission) => !list.parlors.some((parlor) => parlor.submissions.includes(submission.submission)))
    .map((submission) => ({
      parlor: kept(book, { identity: { type: "submitted", submission: submission.submission }, name: submission.name, pools: [] }),
      note: list.rejections.some((rejection) => rejection.submission === submission.submission) ? "申請は却下" : "申請中",
      unplaced: undefined,
      matches: named(submission.name),
    }))
  const offered = [...listed, ...waiting]
  const others: readonly ParlorOffer[] = book
    .filter((parlor) => !offered.some((offer) => identityKey(offer.parlor.identity) === identityKey(parlor.identity)))
    .map((parlor) => ({ parlor, note: "帳簿の店舗", unplaced: undefined, matches: named(parlor.name) }))
  return [...offered, ...others]
}

/**
 * The offers by the key each is chosen by. A list to choose from asks about
 * every offer in turn, and looking each up among them all would be the
 * whole list times itself.
 */
export const offersByKey = (offers: readonly ParlorOffer[]): ReadonlyMap<string, ParlorOffer> => new Map(offers.map((offer) => [identityKey(offer.parlor.identity), offer]))

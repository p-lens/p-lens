import type { BookId } from "../../../core/book/book"
import type { SubmissionId } from "../../../core/parlor/parlor"
import { isPrefecture, isWritableParlorName, type SharedParlor } from "../../../core/parlor/shared"
import type { PlayGameKind } from "../../../core/play/play"
import { Err, Ok, type Result } from "../../../core/result/result"
import type { Submission } from "../../../parlors/port/submission-store"

/**
 * What survey.p-lens.jp sends back, read: the submission to keep and which
 * game's start to return to — or the game alone, when what was reported
 * there brings no parlor here, a closing or a correction.
 */
export type Returned = { readonly type: "submitted"; readonly submission: Submission; readonly from: LeftFrom } | { readonly type: "nothing"; readonly from: LeftFrom }

/**
 * Where a person left for the survey from, and so where they are brought
 * back to: the start of a game's play, a book's play added by hand, or a
 * book's opening balance being registered.
 */
export type LeftFrom =
  | { readonly type: "start"; readonly game: PlayGameKind }
  | { readonly type: "entry"; readonly game: PlayGameKind; readonly bookId: BookId }
  | { readonly type: "savings"; readonly game: PlayGameKind; readonly bookId: BookId }

/** A book's id as it may stand in an address: what ids are made of, and no longer than one. */
const BOOK_ID = /^[A-Za-z0-9_-]{1,64}$/

/** A submission id as survey.p-lens.jp makes one: letters, digits, `-` and `_`. */
const SUBMISSION_ID = /^[A-Za-z0-9_-]{6,64}$/

const LONGEST_NAME = 60

/** What the return address carries when the person left to report where a listed parlor is. */
const LOCATED = "located"

/** What the return address carries when the person left from a book's play added by hand: the book. */
const BOOK = "book"

/** What the return address carries when the person left from a book's opening balance being registered: the book. */
const SAVINGS = "savings"

const returnAddress = (origin: string, from: LeftFrom): URL => {
  const address = new URL("/parlors/submitted", origin)
  address.searchParams.set("game", from.game)
  if (from.type === "entry") address.searchParams.set(BOOK, from.bookId)
  if (from.type === "savings") address.searchParams.set(SAVINGS, from.bookId)
  return address
}

const leftFrom = (query: URLSearchParams): LeftFrom => {
  const game: PlayGameKind = query.get("game") === "pachislot" ? "pachislot" : "pachinko"
  const book = query.get(BOOK) ?? ""
  const savings = query.get(SAVINGS) ?? ""
  if (BOOK_ID.test(savings)) return { type: "savings", game, bookId: savings as BookId }
  return BOOK_ID.test(book) ? { type: "entry", game, bookId: book as BookId } : { type: "start", game }
}

/** Where a person goes to submit a parlor the list lacks: the survey, told where to bring them back. */
export const submitAddress = (survey: string, origin: string, from: LeftFrom): string => {
  const address = new URL(survey)
  address.searchParams.set("return", returnAddress(origin, from).href)
  return address.href
}

/**
 * Where a person goes to report where a listed parlor is: the survey's
 * list, searched for the parlor's whole name so it is the one found, and
 * told where to bring them back.
 */
export const locateAddress = (survey: string, origin: string, from: LeftFrom, parlor: Pick<SharedParlor, "id" | "name">): string => {
  const back = returnAddress(origin, from)
  back.searchParams.set(LOCATED, parlor.id)
  const address = new URL(survey)
  address.searchParams.set("find", parlor.name)
  address.searchParams.set("return", back.href)
  return address.href
}

/**
 * The query survey.p-lens.jp returns with — `submission`, `name`,
 * `prefecture`, the `game` the person left from, the `book` where they
 * left from one's play added by hand and the `savings` where they left
 * from one's opening balance being registered — read, or refused whole
 * if any of it is not what it should be; one that names no submission at
 * all brings nothing but the game, and so does one the person left to
 * report a listed parlor's position, the parlor being listed and chosen
 * already. Nothing here is taken on trust: it
 * arrived in an address anyone can type.
 */
export const returnedFrom = (query: URLSearchParams, now: string): Result<Returned, "unreadable"> => {
  const submission = query.get("submission")?.trim() ?? ""
  const name = query.get("name")?.trim() ?? ""
  const prefecture = query.get("prefecture")?.trim() ?? ""
  const from = leftFrom(query)
  if (query.has(LOCATED) || (!query.has("submission") && !query.has("name") && !query.has("prefecture"))) return Ok({ type: "nothing", from })
  return SUBMISSION_ID.test(submission) && name !== "" && [...name].length <= LONGEST_NAME && isWritableParlorName(name) && isPrefecture(prefecture)
    ? Ok({ type: "submitted", submission: { submission: submission as SubmissionId, name, prefecture, submittedAt: now }, from })
    : Err("unreadable")
}

import { bookInUse, type ListedBook, type MemberId } from "../core/book/book"
import { BOOK_SETTINGS_FILE, withRecentlyPlayed } from "../core/book/settings"
import type { MachineSummary } from "../core/catalog/catalog"
import { playedFirst, recentlyPlayedAmong } from "../core/catalog/recently-played"
import type { MachineId } from "../core/machine/machine"
import type { PlayGameKind } from "../core/play/play"
import { Ok, mapOk } from "../core/result/result"
import type { BookSession } from "./book-session"
import type { Outcome } from "./errors"

const sameOrder = (before: readonly MachineId[], after: readonly MachineId[]): boolean => before.length === after.length && before.every((id, index) => id === after[index])

/** The book in use as it is listed — the first this member may write — or none. */
const listedInUse = async (session: BookSession, member: MemberId): Promise<Outcome<ListedBook | undefined>> =>
  mapOk(await session.books(), (books) => ((id) => books.find((book) => book.id === id))(bookInUse(books, member)))

/**
 * A play of a game started on a machine, put at the head of the machines
 * the book in use keeps as played lately, written into its settings as one
 * change to that book — backed up and synced like any other, every other
 * game and field left as it was. A machine already at the head changes
 * nothing, and nothing is written; one further down moves up to it.
 */
export const rememberPlayed = async (session: BookSession, member: MemberId, game: PlayGameKind, machineId: MachineId): Promise<Outcome<void>> => {
  const book = await listedInUse(session, member)
  if (!book.ok || book.value === undefined) return mapOk(book, () => undefined)
  const kept = book.value.recentlyPlayed[game] ?? []
  const ids = playedFirst(kept, machineId)
  if (sameOrder(kept, ids)) return Ok(undefined)
  const written = await session.write(book.value.id, async (_journal, stored) =>
    mapOk(withRecentlyPlayed(stored.files[BOOK_SETTINGS_FILE], game, ids), (settings) => ({ files: { ...stored.files, [BOOK_SETTINGS_FILE]: settings }, intent: { type: "recently-played-set" as const, game } })),
  )
  return written.ok ? Ok(undefined) : written
}

/** The machines of a game the book in use played lately, latest first, among those a search found; none without a book. */
export const findRecentlyPlayed = async (session: BookSession, member: MemberId, game: PlayGameKind, machines: readonly MachineSummary[]): Promise<Outcome<readonly MachineSummary[]>> =>
  mapOk(await listedInUse(session, member), (book) => (book === undefined ? [] : recentlyPlayedAmong(machines, book.recentlyPlayed[game] ?? [])))

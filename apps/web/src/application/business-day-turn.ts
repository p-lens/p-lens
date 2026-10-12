import { roleIn, type BookId, type MemberId } from "../core/book/book"
import { BOOK_SETTINGS_FILE, withBusinessDayTurn } from "../core/book/settings"
import type { BusinessDayTurn } from "../core/calendar/calendar"
import { Ok } from "../core/result/result"
import type { Preferences } from "../preferences/port/preferences"
import type { BookSession } from "./book-session"
import type { Outcome } from "./errors"

/** The hour written into a book's settings, as one change to that book: kept in its history and carried to the owner's other devices like any other. */
const write = async (session: BookSession, bookId: BookId, turn: BusinessDayTurn): Promise<Outcome<void>> => {
  const written = await session.write(bookId, async (_journal, stored) =>
    Ok({ files: { ...stored.files, [BOOK_SETTINGS_FILE]: withBusinessDayTurn(stored.files[BOOK_SETTINGS_FILE], turn) }, intent: { type: "business-day-turn-set" as const, turn } }),
  )
  return written.ok ? Ok(undefined) : written
}

/**
 * Set the hour a person's business day turns over at. It holds on this
 * device at once, and is written into the settings of each of their own
 * books that does not say it already, so it is backed up with them and
 * reaches their other devices with them. The books are written one after
 * another and the first refused stops the rest. A book of another
 * person's is never written: the hour is its owner's.
 */
export const setBusinessDayTurn = async (session: BookSession, member: MemberId, preferences: Pick<Preferences, "setBusinessDayTurn">, turn: BusinessDayTurn): Promise<Outcome<void>> => {
  preferences.setBusinessDayTurn(turn)
  const books = await session.books()
  if (!books.ok) return books
  return books.value
    .filter((book) => roleIn(book, member) === "owner" && book.businessDayTurn !== turn)
    .reduce<Promise<Outcome<void>>>(async (before, book) => ((done) => (done.ok ? write(session, book.id, turn) : done))(await before), Promise.resolve(Ok(undefined)))
}

/**
 * Take the hour a person's books say their business day turns over at as
 * this device's: the first of their own books, in the order they stand,
 * that says one. Where none does — books written before the hour was kept
 * in them — the device keeps the hour it had.
 */
export const adoptBusinessDayTurn = async (session: BookSession, preferences: Pick<Preferences, "businessDayTurn" | "setBusinessDayTurn">): Promise<Outcome<void>> => {
  const books = await session.books()
  if (!books.ok) return books
  const said = books.value.find((book) => book.businessDayTurn !== undefined)?.businessDayTurn
  if (said !== undefined && said !== preferences.businessDayTurn()) preferences.setBusinessDayTurn(said)
  return Ok(undefined)
}

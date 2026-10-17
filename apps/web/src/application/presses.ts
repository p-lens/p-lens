import type { BookId } from "../core/book/book"
import { BOOK_SETTINGS_FILE, withPresses, type PressAmounts } from "../core/book/settings"
import { Ok, mapOk } from "../core/result/result"
import type { BookSession } from "./book-session"
import type { Outcome } from "./errors"

/**
 * What a press of a live play's buttons adds at a corner, written into a
 * book's settings as one change to that book: kept in its history, backed
 * up and carried to its other devices like any other, every corner and
 * every other setting left as it was.
 */
export const setPresses = async (session: BookSession, bookId: BookId, corner: string, amounts: PressAmounts): Promise<Outcome<void>> => {
  const written = await session.write(bookId, async (_journal, stored) =>
    mapOk(withPresses(stored.files[BOOK_SETTINGS_FILE], corner, amounts), (settings) => ({ files: { ...stored.files, [BOOK_SETTINGS_FILE]: settings }, intent: { type: "presses-set" as const, corner } })),
  )
  return written.ok ? Ok(undefined) : written
}

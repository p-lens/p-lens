import type { BookId } from "../core/book/book"
import { BOOK_SETTINGS_FILE, withBusinessDayTurn } from "../core/book/settings"
import type { BusinessDayTurn } from "../core/calendar/calendar"
import { BOOK_FILES } from "../core/journal/layout"
import { readTitle, withTitle, type TitleProblem } from "../core/journal/title"
import { Ok, type Result } from "../core/result/result"
import type { StoredBook } from "../storage/port/book-storage"
import type { BookSession } from "./book-session"
import type { Outcome } from "./errors"

/**
 * Put one more book on the device, named as the person said: a book of its
 * own beside those already there, empty, owned by whoever uses the device.
 * A person keeps as many as they have things to keep apart — their own
 * play, and what they play with others. The book is the one a device is
 * first given, under a fresh id, with the title in place of its first,
 * and it says from the start the hour its owner's business day turns over
 * at, as their other books do.
 */
export const addBook = async (session: BookSession, fresh: StoredBook, typed: string, businessDayTurn: BusinessDayTurn): Promise<Outcome<Result<BookId, TitleProblem>>> => {
  const title = readTitle(typed)
  if (!title.ok) return Ok(title)
  const settings = withBusinessDayTurn(fresh.files[BOOK_SETTINGS_FILE], businessDayTurn)
  if (!settings.ok) return settings
  const created = await session.createBook({ ...fresh, files: { ...fresh.files, [BOOK_FILES.main]: withTitle(fresh.files[BOOK_FILES.main] ?? "", title.value), [BOOK_SETTINGS_FILE]: settings.value } })
  return created.ok ? Ok(Ok(fresh.book.id)) : created
}

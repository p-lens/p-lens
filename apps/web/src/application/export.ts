import type { Archiver } from "../backup/port/archiver"
import type { Handover } from "../backup/port/handover"
import type { BookId } from "../core/book/book"
import type { IsoDate } from "../core/calendar/calendar"
import { csvOf } from "../core/export/csv"
import { fileStemOf } from "../core/book/file-name"
import { bundleName, fileStemsOf, playTableName, singleJournalName } from "../core/export/file-name"
import { playTableOf } from "../core/export/play-table"
import { singleJournalOf } from "../core/export/single-journal"
import { BOOK_FILES, type BookFiles } from "../core/journal/layout"
import { titleOfMain } from "../core/journal/title"
import { Ok, mapErr, mapOk } from "../core/result/result"
import type { BookSession } from "./book-session"
import type { Outcome } from "./errors"
import { linesIn } from "./play-lines"

/** Everything writing a book out reaches: the book as hledger reads it, the archive several files go as one in, the handing over of a file, and the day it is. */
export interface ExportPorts {
  readonly session: BookSession
  readonly archiver: Archiver
  readonly handover: Handover
  readonly today: () => IsoDate
}

/** A file made from a book, ready to hand over: its name, its media type and its text. */
interface Written {
  readonly name: string
  readonly type: string
  readonly text: string
}

const encoder = new TextEncoder()

const given = async (ports: ExportPorts, name: string, type: string, bytes: Uint8Array<ArrayBuffer>): Promise<Outcome<void>> =>
  mapErr(await ports.handover.give({ name, type, bytes }), (failure) => ({ type: "handover", failure }) as const)

const handed = async (ports: ExportPorts, written: Outcome<Written>): Promise<Outcome<void>> =>
  written.ok ? given(ports, written.value.name, written.value.type, new Uint8Array(encoder.encode(written.value.text))) : written

/** What a book's files are named by, given the book's files: its own title or id when it is written out alone, and what tells it from the others when several are. */
type Stem = (files: BookFiles, bookId: BookId) => string

const ownStem: Stem = (files, bookId) => fileStemOf(titleOfMain(files[BOOK_FILES.main] ?? ""), bookId)

/** A book's journals as one file hledger opens by itself: the book as hledger last read it, since nothing is kept that hledger did not read. */
const singleJournal = (ports: ExportPorts, bookId: BookId, stem: Stem): Promise<Outcome<Written>> =>
  ports.session.read(bookId, async (_journal, stored) => Ok({ name: singleJournalName(stem(stored.files, bookId), ports.today()), type: "text/plain", text: singleJournalOf(stored.files) }))

/** Hand a book's journals to the person as one file hledger opens by itself. */
export const exportSingleJournal = async (ports: ExportPorts, bookId: BookId): Promise<Outcome<void>> => handed(ports, await singleJournal(ports, bookId, ownStem))

/** Every play of a book as a table, a play a row, newest first: what a spreadsheet opens. */
const playTable = (ports: ExportPorts, bookId: BookId, stem: Stem): Promise<Outcome<Written>> =>
  ports.session.read(bookId, async (journal, stored) =>
    mapOk(await linesIn(journal, ""), (lines) => ({
      name: playTableName(stem(stored.files, bookId), ports.today()),
      type: "text/csv",
      text: csvOf(playTableOf(lines)),
    })),
  )

/** Hand the person every play of a book as a table. */
export const exportPlayTable = async (ports: ExportPorts, bookId: BookId): Promise<Outcome<void>> => handed(ports, await playTable(ports, bookId, ownStem))

/** Both files of each book, one book after another: the first that cannot be made stops the rest. */
const everyFileOf = async (ports: ExportPorts, bookIds: readonly BookId[], stem: Stem): Promise<Outcome<readonly Written[]>> => {
  const [bookId, ...rest] = bookIds
  if (bookId === undefined) return Ok([])
  const journal = await singleJournal(ports, bookId, stem)
  if (!journal.ok) return journal
  const table = await playTable(ports, bookId, stem)
  if (!table.ok) return table
  return mapOk(await everyFileOf(ports, rest, stem), (others) => [journal.value, table.value, ...others])
}

/**
 * Hand the person several books together, as one archive: each book's
 * single journal and its table of plays, side by side under their own
 * names. A book is its id and not its title, so books of one title are
 * told apart in their files' names by when each was made. It is the files
 * a book is written out as, gathered — not a backup, which carries a book
 * whole and is what one is put back from.
 */
export const exportTogether = async (ports: ExportPorts, bookIds: readonly BookId[]): Promise<Outcome<void>> => {
  const books = await ports.session.books()
  if (!books.ok) return books
  const stems = fileStemsOf(books.value.filter((book) => bookIds.includes(book.id)))
  const files = await everyFileOf(ports, bookIds, (stored, bookId) => stems.get(bookId) ?? ownStem(stored, bookId))
  if (!files.ok) return files
  const packed = mapErr(ports.archiver.pack(Object.fromEntries(files.value.map((file) => [file.name, file.text]))), (failure) => ({ type: "archive", failure }) as const)
  return packed.ok ? given(ports, bundleName(ports.today()), ports.archiver.mediaType, packed.value) : packed
}

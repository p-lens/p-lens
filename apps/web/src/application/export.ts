import type { Archiver } from "../backup/port/archiver"
import type { HandedFile, Handover } from "../backup/port/handover"
import type { BookId } from "../core/book/book"
import type { IsoDate } from "../core/calendar/calendar"
import { csvOf } from "../core/export/csv"
import { fileStemOf } from "../core/book/file-name"
import { bundleName, fileStemsOf, precordName, tallyTableName, singleJournalName } from "../core/export/file-name"
import { precordCsvOf } from "../core/export/precord"
import { tallyTableOf } from "../core/export/tally-table"
import { singleJournalOf } from "../core/export/single-journal"
import { BOOK_FILES, journalsOf, type BookFiles } from "../core/journal/layout"
import { titleOfMain } from "../core/journal/title"
import { Ok, mapErr, mapOk } from "../core/result/result"
import type { TallyLine } from "../core/report/tally-line"
import { tallyNotesIn } from "../core/tally/in-journal"
import type { StoredBook } from "../storage/port/book-storage"
import type { BookSession } from "./book-session"
import type { Outcome } from "./errors"
import { linesIn } from "./tally-lines"

/** Everything writing a book out reaches: the book as hledger reads it, the archive several files go as one in, the handing over of a file, and the day it is. */
export interface ExportPorts {
  readonly session: BookSession
  readonly archiver: Archiver
  readonly handover: Handover
  readonly today: () => IsoDate
}

/**
 * How far making a file has got: a book being read — waiting its turn in
 * hledger, and opened there — its tallies being totalled by hledger, and,
 * for several books together, how many of them are made and the archive
 * being packed.
 */
export type ExportReport =
  | { readonly type: "reading" }
  | { readonly type: "totalling" }
  | { readonly type: "book"; readonly done: number; readonly of: number }
  | { readonly type: "packing" }

/**
 * Who a file being made tells how far it has got, and the person stopping
 * it: heeded before each stage of a book and between books, since a
 * question already put to hledger runs to its end.
 */
export interface ExportWatch {
  readonly onReport: (report: ExportReport) => void
  readonly stopped: AbortSignal
}

/** A file made, ready to hand over, or the making stopped by the person: a book is only read, so neither leaves anything behind. */
export type Made = { readonly type: "made"; readonly file: HandedFile } | { readonly type: "stopped" }

/** A file made from a book: its name, its media type and its text. */
interface Written {
  readonly name: string
  readonly mediaType: string
  readonly text: string
}

const encoder = new TextEncoder()

const STOPPED: Made = { type: "stopped" }

/** A file made, or none where the person stopped it first. */
const madeOf = (written: Outcome<Written | undefined>): Outcome<Made> =>
  mapOk(written, (file) => (file === undefined ? STOPPED : { type: "made", file: { name: file.name, type: file.mediaType, bytes: new Uint8Array(encoder.encode(file.text)) } }))

/** What a book's files are named by, given the book's files: its own title or id when it is written out alone, and what tells it from the others when several are. */
type Stem = (files: BookFiles, bookId: BookId) => string

const ownStem: Stem = (files, bookId) => fileStemOf(titleOfMain(files[BOOK_FILES.main] ?? ""), bookId)

/** A book's journals as one file hledger opens by itself, from its files as stored: hledger is not asked, and a file nothing but hledger had accepted is never stored, so nothing waits for hledger's turn. None where the person stopped it. */
const singleJournal = async (ports: ExportPorts, bookId: BookId, stem: Stem, watch: ExportWatch): Promise<Outcome<Written | undefined>> => {
  if (watch.stopped.aborted) return Ok(undefined)
  watch.onReport({ type: "reading" })
  return mapOk(await ports.session.stored(bookId), (stored) => ({ name: singleJournalName(stem(stored.files, bookId), ports.today()), mediaType: "text/plain", text: singleJournalOf(stored.files) }))
}

/** A file made of every tally of a book, as hledger reads it: the book read in its turn, its tallies totalled, then the file made of them. None where the person stopped it, the book not opened where they stopped it while it waited its turn. */
const ofTallies = async (ports: ExportPorts, bookId: BookId, watch: ExportWatch, made: (lines: readonly TallyLine[], stored: StoredBook) => Written): Promise<Outcome<Written | undefined>> => {
  if (watch.stopped.aborted) return Ok(undefined)
  watch.onReport({ type: "reading" })
  return ports.session.readUnlessStopped(bookId, watch.stopped, async (journal, stored) => {
    watch.onReport({ type: "totalling" })
    return mapOk(await linesIn(journal, ""), (lines) => (watch.stopped.aborted ? undefined : made(lines, stored)))
  })
}

/** Every tally of a book as a table, a tally a row, newest first: what a spreadsheet opens. */
const playTable = (ports: ExportPorts, bookId: BookId, stem: Stem, watch: ExportWatch): Promise<Outcome<Written | undefined>> =>
  ofTallies(ports, bookId, watch, (lines, stored) => ({ name: tallyTableName(stem(stored.files, bookId), ports.today()), mediaType: "text/csv", text: csvOf(tallyTableOf(lines)) }))

/** A book's journals as one file hledger opens by itself. */
export const makeSingleJournal = async (ports: ExportPorts, bookId: BookId, watch: ExportWatch): Promise<Outcome<Made>> => madeOf(await singleJournal(ports, bookId, ownStem, watch))

/** Every tally of a book as a table. */
export const makeTallyTable = async (ports: ExportPorts, bookId: BookId, watch: ExportWatch): Promise<Outcome<Made>> => madeOf(await playTable(ports, bookId, ownStem, watch))

/**
 * Every tally of a book as pRecord's CSV, newest first, for pRecord to
 * take in. It goes by itself and never in the zip: it is for another app,
 * and the table carries the same tallies and more.
 */
export const makeForPrecord = async (ports: ExportPorts, bookId: BookId, watch: ExportWatch): Promise<Outcome<Made>> =>
  madeOf(
    await ofTallies(ports, bookId, watch, (lines, stored) => ({
      name: precordName(ownStem(stored.files, bookId), ports.today()),
      mediaType: "text/csv",
      text: precordCsvOf(lines, tallyNotesIn(journalsOf(stored.files).map(([, text]) => text))),
    })),
  )

/** A book's stages, untold: several books together are told of book by book. */
const quietly = (watch: ExportWatch): ExportWatch => ({ onReport: () => undefined, stopped: watch.stopped })

/** Both files of each book, one book after another, each told as it is begun: the first that cannot be made stops the rest, and none where the person stopped them. */
const everyFileOf = async (ports: ExportPorts, bookIds: readonly BookId[], stem: Stem, watch: ExportWatch, done: number): Promise<Outcome<readonly Written[] | undefined>> => {
  const bookId = bookIds[done]
  if (bookId === undefined) return Ok([])
  watch.onReport({ type: "book", done, of: bookIds.length })
  const journal = await singleJournal(ports, bookId, stem, quietly(watch))
  if (!journal.ok || journal.value === undefined) return journal.ok ? Ok(undefined) : journal
  const table = await playTable(ports, bookId, stem, quietly(watch))
  if (!table.ok || table.value === undefined) return table.ok ? Ok(undefined) : table
  const [single, tallied] = [journal.value, table.value]
  return mapOk(await everyFileOf(ports, bookIds, stem, watch, done + 1), (others) => (others === undefined ? undefined : [single, tallied, ...others]))
}

/**
 * Several books together, as one archive: each book's single journal and
 * its table of tallies, side by side under their own names. A book is its
 * id and not its title, so books of one title are told apart in their
 * files' names by when each was made. It is the files a book is written
 * out as, gathered — not a backup, which carries a book whole and is what
 * one is put back from.
 */
export const makeTogether = async (ports: ExportPorts, bookIds: readonly BookId[], watch: ExportWatch): Promise<Outcome<Made>> => {
  const books = await ports.session.books()
  if (!books.ok) return books
  const stems = fileStemsOf(books.value.filter((book) => bookIds.includes(book.id)))
  const files = await everyFileOf(ports, bookIds, (stored, bookId) => stems.get(bookId) ?? ownStem(stored, bookId), watch, 0)
  if (!files.ok) return files
  if (files.value === undefined || watch.stopped.aborted) return Ok(STOPPED)
  watch.onReport({ type: "packing" })
  const packed = mapErr(ports.archiver.pack(Object.fromEntries(files.value.map((file) => [file.name, file.text]))), (failure) => ({ type: "archive", failure }) as const)
  return mapOk(packed, (bytes) => ({ type: "made", file: { name: bundleName(ports.today()), type: ports.archiver.mediaType, bytes } }))
}

/** Hand a file made to the person, to save wherever they choose. */
export const handOver = async (ports: Pick<ExportPorts, "handover">, file: HandedFile): Promise<Outcome<void>> =>
  mapErr(await ports.handover.give(file), (failure) => ({ type: "handover", failure }) as const)

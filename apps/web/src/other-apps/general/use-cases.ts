import type { BookId } from "../../core/book/book"
import type { PlayGameKind } from "../../core/play/play"
import { mapErr, mapOk, Ok, type Result } from "../../core/result/result"
import type { Outcome } from "../../application/errors"
import { bundleName, fileNameOf, fileStemsOf, singleJournalName } from "../core/file-name"
import { csvOf } from "../core/csv"
import { madeOf, ofTallies, ownStem, type ExportPorts, type ExportWatch, type Made, type Stem, type Written } from "../application/export"
import { importTallies, previewOf, type Imported, type ImportError, type ImportPorts, type Named, type Preview, type Weighing } from "../application/import"
import { tallyTableOf } from "./csv-export"
import { GENERAL, readGeneral, type GeneralProblem, type Mapping, type Sheet } from "./csv-import"
import { singleJournalOf } from "./journal-export"
import { playTableOf } from "./play-csv-export"

/** A file of a person's own making looked at before it is taken in, its columns read as the person tied them to this app's fields. */
export const previewGeneral = (ports: Pick<ImportPorts, "catalog">, sheet: Sheet, mapping: Mapping): Promise<Result<Preview, ImportError<GeneralProblem>>> => previewOf(ports, readGeneral(sheet, mapping))

/** Take the tallies of a file of a person's own making into a book, as it was looked at: weighed, where a person asked, as a pRecord file's are. */
export const importGeneral = (ports: ImportPorts, bookId: BookId, preview: Preview, named: Named, weighing: Weighing | undefined): Promise<Result<Imported, ImportError<never>>> =>
  importTallies(ports, bookId, GENERAL, preview, named, weighing)

/** A book's journals as one file hledger opens by itself, from its files as stored: hledger is not asked, and a file nothing but hledger had accepted is never stored, so nothing waits for hledger's turn. None where the person stopped it. */
const singleJournal = async (ports: ExportPorts, bookId: BookId, stem: Stem, watch: ExportWatch): Promise<Outcome<Written | undefined>> => {
  if (watch.stopped.aborted) return Ok(undefined)
  watch.onReport({ type: "reading" })
  return mapOk(await ports.session.stored(bookId), (stored) => ({ name: singleJournalName(stem(stored.files, bookId), ports.today()), mediaType: "text/plain", text: singleJournalOf(stored.files) }))
}

/** A book's stages, untold: several books together are told of book by book. */
const quietly = (watch: ExportWatch): ExportWatch => ({ onReport: () => undefined, stopped: watch.stopped })

/** Every tally of a book as a table, a tally a row, newest first: what a spreadsheet opens. */
const tallyTable = (ports: ExportPorts, bookId: BookId, stem: Stem, watch: ExportWatch): Promise<Outcome<Written | undefined>> =>
  ofTallies(ports, bookId, watch, (lines, stored) => ({ name: fileNameOf(stem(stored.files, bookId), "収支", ports.today(), "csv"), mediaType: "text/csv", text: csvOf(tallyTableOf(lines)) }))

/** A book's journals as one file hledger opens by itself. */
export const makeSingleJournal = async (ports: ExportPorts, bookId: BookId, watch: ExportWatch): Promise<Outcome<Made>> => madeOf(await singleJournal(ports, bookId, ownStem, watch))

/** Every tally of a book as a table. */
export const makeTallyTable = async (ports: ExportPorts, bookId: BookId, watch: ExportWatch): Promise<Outcome<Made>> => madeOf(await tallyTable(ports, bookId, ownStem, watch))

const GAME_KINDS: readonly PlayGameKind[] = ["pachinko", "pachislot"]

/** What each game's table of plays is, as its file's name says it. */
const PLAY_TABLE_WORDS: Readonly<Record<PlayGameKind, string>> = { pachinko: "パチンコ稼働", pachislot: "パチスロ稼働" }

/** A book's recorded plays of some games, a table of their readings for each, from its files as stored, never asked of hledger; none where the person stopped it. */
const playTables = async (ports: ExportPorts, bookId: BookId, stem: Stem, watch: ExportWatch, gameKinds: readonly PlayGameKind[]): Promise<Outcome<readonly Written[] | undefined>> => {
  if (watch.stopped.aborted) return Ok(undefined)
  watch.onReport({ type: "reading" })
  return mapOk(await ports.session.stored(bookId), (stored) =>
    gameKinds.map((gameKind) => ({ name: fileNameOf(stem(stored.files, bookId), PLAY_TABLE_WORDS[gameKind], ports.today(), "csv"), mediaType: "text/csv", text: csvOf(playTableOf(stored.files, gameKind)) })),
  )
}

/** Files made, packed as one archive under a name: none where the person stopped them first. */
const packedAs = (ports: ExportPorts, files: Outcome<readonly Written[] | undefined>, name: string, watch: ExportWatch): Outcome<Made> => {
  if (!files.ok) return files
  if (files.value === undefined || watch.stopped.aborted) return Ok({ type: "stopped" })
  watch.onReport({ type: "packing" })
  const packed = mapErr(ports.archiver.pack(Object.fromEntries(files.value.map((file) => [file.name, file.text]))), (failure) => ({ type: "archive", failure }) as const)
  return mapOk(packed, (bytes) => ({ type: "made", file: { name, type: ports.archiver.mediaType, bytes } }))
}

/**
 * A book's recorded plays of one game — what ライブ計測 saw of each,
 * reading by reading — as a CSV, the games apart, their readings having
 * different things to say; a book with no play of the game gives a file of
 * its column names alone.
 */
export const makePlayTable =
  (gameKind: PlayGameKind) =>
  async (ports: ExportPorts, bookId: BookId, watch: ExportWatch): Promise<Outcome<Made>> =>
    madeOf(mapOk(await playTables(ports, bookId, ownStem, watch, [gameKind]), (files) => files?.[0]))

/** Each book's files, one book after another, each told as it is begun: the first that cannot be made stops the rest, and none where the person stopped them. */
const everyFileOf = async (ports: ExportPorts, bookIds: readonly BookId[], stem: Stem, watch: ExportWatch, done: number): Promise<Outcome<readonly Written[] | undefined>> => {
  const bookId = bookIds[done]
  if (bookId === undefined) return Ok([])
  watch.onReport({ type: "book", done, of: bookIds.length })
  const journal = await singleJournal(ports, bookId, stem, quietly(watch))
  if (!journal.ok || journal.value === undefined) return journal.ok ? Ok(undefined) : journal
  const table = await tallyTable(ports, bookId, stem, quietly(watch))
  if (!table.ok || table.value === undefined) return table.ok ? Ok(undefined) : table
  const plays = await playTables(ports, bookId, stem, quietly(watch), GAME_KINDS)
  if (!plays.ok || plays.value === undefined) return plays.ok ? Ok(undefined) : plays
  const [single, tallied, played] = [journal.value, table.value, plays.value]
  return mapOk(await everyFileOf(ports, bookIds, stem, watch, done + 1), (others) => (others === undefined ? undefined : [single, tallied, ...played, ...others]))
}

/**
 * Several books together, as one archive: each book's single journal, its
 * table of tallies and its tables of plays, side by side under their own names. A book is its
 * id and not its title, so books of one title are told apart in their
 * files' names by when each was made. It is the files a book is written
 * out as, gathered — not a backup, which carries a book whole and is what
 * one is put back from.
 */
export const makeTogether = async (ports: ExportPorts, bookIds: readonly BookId[], watch: ExportWatch): Promise<Outcome<Made>> => {
  const books = await ports.session.books()
  if (!books.ok) return books
  const stems = fileStemsOf(books.value.filter((book) => bookIds.includes(book.id)))
  return packedAs(ports, await everyFileOf(ports, bookIds, (stored, bookId) => stems.get(bookId) ?? ownStem(stored, bookId), watch, 0), bundleName(ports.today()), watch)
}


import type { IsoDate } from "../calendar/calendar"
import type { PlayId } from "../play/play"
import { withoutTallyEntry, withTallyEntry } from "../tally/in-journal"
import { appendEntry, BOOK_FILES, prependEntry, type BookFiles } from "./layout"

/**
 * Where a book's transactions are kept: each in the file of its year, by
 * the day it is dated. The years are only where entries are put, and
 * nothing is written where one year ends and the next begins: the book is
 * the years' files one after another, as `main.journal` includes them, and
 * any period is asked of hledger by its days.
 */

const YEAR_FILE = /^transactions\/\d{4}\.journal$/

/** The file of the transactions dated in a day's year. */
export const yearFileOf = (date: IsoDate): string => `transactions/${date.slice(0, 4)}.journal`

/** Whether a path is one of a book's files of transactions, a year's. */
export const isTransactionsFile = (path: string): boolean => YEAR_FILE.test(path)

const INCLUDE = /^include\s+(\S+)/

/** The file an include line names, or none for a line that is no include. */
const includedBy = (line: string): string | undefined => INCLUDE.exec(line)?.[1]

/** Whether a file is to be included after a year's: a later year's. */
const comesAfter =
  (path: string) =>
  (included: string | undefined): boolean =>
    included !== undefined && YEAR_FILE.test(included) && included > path

/**
 * The main journal including a year's file, by name: among the years in
 * their order, or after its last include where it has none later. A main journal that includes it
 * already is as it was.
 */
export const includingYear = (main: string, path: string): string => {
  const lines = main.replace(/\n+$/, "").split("\n")
  if (lines.some((line) => includedBy(line) === path)) return main
  const before = lines.findIndex((line) => comesAfter(path)(includedBy(line)))
  const lastInclude = lines.findLastIndex((line) => includedBy(line) !== undefined)
  const at = before !== -1 ? before : lastInclude !== -1 ? lastInclude + 1 : lines.length
  return `${[...lines.slice(0, at), `include ${path}`, ...lines.slice(at)].join("\n")}\n`
}

/** A book's files with a year's file written to, the main journal including it where it did not. */
const withYearFile = (files: BookFiles, path: string, text: string): BookFiles => ({ ...files, [path]: text, [BOOK_FILES.main]: includingYear(files[BOOK_FILES.main] ?? "", path) })

/**
 * A book's files with an entry written into the file of its day's year: at
 * its end, or at its head for an entry that opens the book.
 */
export const withEntryFiled = (files: BookFiles, date: IsoDate, entry: string, at: "end" | "head" = "end"): BookFiles => {
  const path = yearFileOf(date)
  const text = files[path] ?? ""
  return withYearFile(files, path, at === "end" ? appendEntry(text, entry) : prependEntry(text, entry))
}

/** A book's files of transactions, each by its path, that hold a tally's entry. */
const holding = (files: BookFiles, id: PlayId): string | undefined =>
  Object.keys(files)
    .filter(isTransactionsFile)
    .find((path) => withoutTallyEntry(files[path] ?? "", id) !== undefined)

/**
 * A book's files with a tally's entry written anew: where it stands, if its
 * day is still of that file's year — every other line as it was — or else
 * taken out of where it stood and written at the end of its new year's file. None where no file of the book's
 * transactions holds it.
 */
export const withTallyFiled = (files: BookFiles, id: PlayId, date: IsoDate, entry: string): BookFiles | undefined => {
  const path = holding(files, id)
  if (path === undefined) return undefined
  const stays = path === yearFileOf(date)
  const text = stays ? withTallyEntry(files[path] ?? "", id, entry) : withoutTallyEntry(files[path] ?? "", id)
  if (text === undefined) return undefined
  return stays ? { ...files, [path]: text } : withEntryFiled({ ...files, [path]: text }, date, entry)
}

/** A book's files without a tally's entry, wherever it stood; none where no file of the book's transactions holds it. */
export const withoutTallyFiled = (files: BookFiles, id: PlayId): BookFiles | undefined => {
  const path = holding(files, id)
  const text = path === undefined ? undefined : withoutTallyEntry(files[path] ?? "", id)
  return path === undefined || text === undefined ? undefined : { ...files, [path]: text }
}

/** An entry as it is filed: the day it is dated, and its text. */
export interface Filed {
  readonly date: IsoDate
  readonly text: string
}

/** Entries' texts one after another, one blank line between each, as appending them one by one would set them. */
const together = (texts: readonly string[]): string => texts.map((text, at) => (at < texts.length - 1 ? text.replace(/\n*$/, "") : text)).join("\n\n")

/** A book's files with entries written at the ends of the files of their days' years, in the order given: each year's written once, however many go into it. */
export const withEntriesFiled = (files: BookFiles, entries: readonly Filed[]): BookFiles =>
  [...entries.reduce((byYear, entry) => byYear.set(yearFileOf(entry.date), [...(byYear.get(yearFileOf(entry.date)) ?? []), entry]), new Map<string, readonly Filed[]>())].reduce(
    (built, [path, filed]) => withYearFile(built, path, appendEntry(built[path] ?? "", together(filed.map((entry) => entry.text)))),
    files,
  )

/** A day an entry's header opens with, as the app writes it. */
const HEADER = /^(\d{4})-\d{2}-\d{2}/

/** A line of an entry under its header: a posting, or a note on it. */
const isIndented = (line: string): boolean => /^[ \t]/.test(line)

/** A day of its own on a posting, which would put the posting in another year than its entry's. */
const POSTING_DATE = /;.*\bdate2?:/

/** The entries of a text, each its lines, from its header to its last indented line; none where the text holds anything else. */
const entriesOf = (text: string): readonly (readonly string[])[] | undefined => {
  const lines = text.split("\n")
  if (!lines.every((line) => line.trim() === "" || HEADER.test(line) || (isIndented(line) && !POSTING_DATE.test(line)))) return undefined
  return lines.reduce<string[][]>(
    (entries, line) => (HEADER.test(line) ? [...entries, [line]] : isIndented(line) && line.trim() !== "" ? [...entries.slice(0, -1), [...(entries.at(-1) ?? []), line]] : entries),
    [],
  )
}

/** The days a file of transactions has entries on, as their headers say; none where it holds anything but entries the app writes, which may bear on any day. */
export const entryDaysOf = (text: string): readonly IsoDate[] | undefined => entriesOf(text)?.map((entry) => (entry[0] ?? "").slice(0, 10) as IsoDate)

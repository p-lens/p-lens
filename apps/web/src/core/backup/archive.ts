import type { BookId } from "../book/book"
import { fileStemOf } from "../book/file-name"
import type { IsoDate } from "../calendar/calendar"
import type { BookFiles } from "../journal/layout"
import { Err, Ok, type Result } from "../result/result"

/**
 * A backup: a book's files exactly as they are kept, whose book they are,
 * and when they were taken. No history and no key — what hledger on a desk
 * opens as it stands.
 */
export interface Backup {
  readonly bookId: BookId
  /** ISO 8601. */
  readonly madeAt: string
  readonly files: BookFiles
}

/** The files an archive holds, by path: a book's own, and the manifest beside them. */
export type ArchiveFiles = Readonly<Record<string, string>>

/**
 * The one file an archive holds that is not the book's: whose book the
 * others are. No journal includes it, so hledger never reads it.
 */
export const MANIFEST_PATH = "manifest.json"

/** The archive's layout, counted up when one an older app could not read is made. */
const FORMAT = 1

/**
 * Why an archive is not a backup this app can put back.
 *
 * - `no-manifest`: it does not say whose book it holds.
 * - `newer-format`: a newer app made it, in a layout this one does not know.
 */
export type ArchiveProblem =
  | { readonly type: "no-manifest" }
  | { readonly type: "unreadable-manifest" }
  | { readonly type: "newer-format"; readonly format: number }

/** A backup as the files of its archive: the book's own, untouched, and the manifest. */
export const archiveOf = (backup: Backup): ArchiveFiles => ({
  ...backup.files,
  [MANIFEST_PATH]: `${JSON.stringify({ format: FORMAT, bookId: backup.bookId, madeAt: backup.madeAt }, undefined, 2)}\n`,
})

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> => typeof value === "object" && value !== null && !Array.isArray(value)

const manifestOf = (text: string): Result<Omit<Backup, "files">, ArchiveProblem> => {
  try {
    const parsed: unknown = JSON.parse(text)
    if (!isRecord(parsed) || typeof parsed["format"] !== "number") return Err({ type: "unreadable-manifest" })
    if (parsed["format"] > FORMAT) return Err({ type: "newer-format", format: parsed["format"] })
    const { bookId, madeAt } = parsed
    return typeof bookId === "string" && bookId !== "" && typeof madeAt === "string" ? Ok({ bookId: bookId as BookId, madeAt }) : Err({ type: "unreadable-manifest" })
  } catch {
    return Err({ type: "unreadable-manifest" })
  }
}

/** The backup an archive's files are, if they are one: what comes from elsewhere is not taken on trust. */
export const backupOf = (archive: ArchiveFiles): Result<Backup, ArchiveProblem> => {
  const { [MANIFEST_PATH]: manifest, ...files } = archive
  if (manifest === undefined) return Err({ type: "no-manifest" })
  const read = manifestOf(manifest)
  return read.ok ? Ok({ ...read.value, files }) : read
}

/**
 * The name a backup's archive goes by: its book's title, or its id where it
 * has none, the day it was taken where archives pile up side by side, and
 * what it is — `帳簿_2026-10-07_backup.zip` — joined by underscores. The
 * day is marked as the backup's, not left to be read as a day in the book.
 */
export const archiveName = (title: string | undefined, bookId: BookId, day: IsoDate | undefined): string => {
  const stem = fileStemOf(title, bookId)
  return day === undefined ? `${stem}_backup.zip` : `${stem}_${day}_backup.zip`
}

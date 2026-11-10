import type { Archiver } from "../../backup/port/archiver"
import type { HandedFile, Handover } from "../../backup/port/handover"
import type { BookId } from "../../core/book/book"
import type { IsoDate } from "../../core/calendar/calendar"
import { fileStemOf } from "../../core/book/file-name"
import { BOOK_FILES, journalsOf, type BookFiles } from "../../core/journal/layout"
import { titleOfMain } from "../../core/journal/title"
import { Ok, mapErr, mapOk } from "../../core/result/result"
import type { TallyLine } from "../../core/report/tally-line"
import type { PlayId } from "../../core/play/play"
import { tallyNotesIn } from "../../core/tally/in-journal"
import type { StoredBook } from "../../storage/port/book-storage"
import type { BookSession } from "../../application/book-session"
import type { Outcome } from "../../application/errors"
import { linesIn } from "../../application/tally-lines"

/** Everything writing a book out reaches: the book as hledger reads it, the archive several files go as one in, the handing over of a file, the day it is, and the moment, in milliseconds since the epoch. */
export interface ExportPorts {
  readonly session: BookSession
  readonly archiver: Archiver
  readonly handover: Handover
  readonly today: () => IsoDate
  readonly now: () => number
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
export interface Written {
  readonly name: string
  readonly mediaType: string
  readonly text: string
}

/** A file made from a book in bytes, for an app that takes its text in another encoding or none: its name, its media type and its bytes. */
export interface WrittenBytes {
  readonly name: string
  readonly mediaType: string
  readonly bytes: Uint8Array<ArrayBuffer>
}

const encoder = new TextEncoder()

export const utf8Of = (text: string): Uint8Array<ArrayBuffer> => new Uint8Array(encoder.encode(text))

const STOPPED: Made = { type: "stopped" }

/** A file made, or none where the person stopped it first. */
export const madeOf = (written: Outcome<Written | undefined>): Outcome<Made> =>
  mapOk(written, (file) => (file === undefined ? STOPPED : { type: "made", file: { name: file.name, type: file.mediaType, bytes: utf8Of(file.text) } }))

/** A file made in bytes, or none where the person stopped it first. */
export const madeOfBytes = (written: Outcome<WrittenBytes | undefined>): Outcome<Made> => mapOk(written, (file) => (file === undefined ? STOPPED : { type: "made", file: { name: file.name, type: file.mediaType, bytes: file.bytes } }))

/** What a book's files are named by, given the book's files: its own title or id when it is written out alone, and what tells it from the others when several are. */
export type Stem = (files: BookFiles, bookId: BookId) => string

export const ownStem: Stem = (files, bookId) => fileStemOf(titleOfMain(files[BOOK_FILES.main] ?? ""), bookId)

/** A file made of every tally of a book, as hledger reads it: the book read in its turn, its tallies totalled, then the file made of them. None where the person stopped it, the book not opened where they stopped it while it waited its turn. */
export const ofTallies = async <File>(ports: ExportPorts, bookId: BookId, watch: ExportWatch, made: (lines: readonly TallyLine[], stored: StoredBook) => File): Promise<Outcome<File | undefined>> => {
  if (watch.stopped.aborted) return Ok(undefined)
  watch.onReport({ type: "reading" })
  return ports.session.readUnlessStopped(bookId, watch.stopped, async (journal, stored) => {
    watch.onReport({ type: "totalling" })
    return mapOk(await linesIn(journal, ""), (lines) => (watch.stopped.aborted ? undefined : made(lines, stored)))
  })
}

/** The notes under each of a book's tallies, by its play's id: what a file for another app writes as a tally's memo. */
export const notesOf = (stored: StoredBook): ReadonlyMap<PlayId, string> => tallyNotesIn(journalsOf(stored.files).map(([, text]) => text))

/** Hand a file made to the person, to save wherever they choose. */
export const handOver = async (ports: Pick<ExportPorts, "handover">, file: HandedFile): Promise<Outcome<void>> =>
  mapErr(await ports.handover.give(file), (failure) => ({ type: "handover", failure }) as const)

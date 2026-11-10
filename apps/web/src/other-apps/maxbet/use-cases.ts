import type { BookId } from "../../core/book/book"
import { mapOk, type Result } from "../../core/result/result"
import type { Outcome } from "../../application/errors"
import { fileNameOf } from "../core/file-name"
import { madeOf, notesOf, ofTallies, ownStem, type ExportPorts, type ExportWatch, type Made } from "../application/export"
import { importTallies, previewOf, type Imported, type ImportError, type ImportPorts, type Named, type Preview } from "../application/import"
import { readMaxbetCsv } from "./csv-import"
import { maxbetJsonOf } from "./json-export"
import { isMaxbetJson, readMaxbetJson } from "./json-import"
import { MAXBET, type MaxbetProblem } from "./tags"

/** A MAXBET file looked at before it is taken in: its backup (JSON) or its CSV, with how many of its tallies were of something other than play. */
export const previewMaxbet = async (ports: Pick<ImportPorts, "catalog">, text: string): Promise<Result<Preview, ImportError<MaxbetProblem>>> => {
  const read = isMaxbetJson(text) ? readMaxbetJson(text) : readMaxbetCsv(text)
  return mapOk(await previewOf(ports, mapOk(read, (file) => file.tallies)), (preview) => ({ ...preview, otherThanPlay: read.ok ? read.value.otherThanPlay : 0 }))
}

/**
 * Take the tallies of a MAXBET file into a book, as it was looked at — its
 * backup's or its CSV's alike. None of them says how long it lasted, so
 * none is weighed.
 */
export const importMaxbet = (ports: ImportPorts, bookId: BookId, preview: Preview, named: Named): Promise<Result<Imported, ImportError<never>>> => importTallies(ports, bookId, MAXBET, preview, named, undefined)

/** Every tally of a book as MAXBET's backup (JSON), newest first, for MAXBET to take in: by itself and never in the zip, as pRecord's is. */
export const makeForMaxbet = async (ports: ExportPorts, bookId: BookId, watch: ExportWatch): Promise<Outcome<Made>> =>
  madeOf(await ofTallies(ports, bookId, watch, (lines, stored) => ({ name: fileNameOf(ownStem(stored.files, bookId), "MAXBET", ports.today(), "json"), mediaType: "application/json", text: maxbetJsonOf(lines, notesOf(stored), ports.now()) })))

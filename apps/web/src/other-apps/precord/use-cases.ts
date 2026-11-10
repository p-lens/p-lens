import type { BookId } from "../../core/book/book"
import type { Result } from "../../core/result/result"
import type { Outcome } from "../../application/errors"
import { fileNameOf } from "../core/file-name"
import { madeOf, notesOf, ofTallies, ownStem, type ExportPorts, type ExportWatch, type Made } from "../application/export"
import { importTallies, previewOf, type Imported, type ImportError, type ImportPorts, type Named, type Preview, type Weighing } from "../application/import"
import { precordCsvOf } from "./csv-export"
import { PRECORD, readPrecord, type PrecordProblem } from "./csv-import"

/** A pRecord file looked at before it is taken in. */
export const previewPrecord = (ports: Pick<ImportPorts, "catalog">, text: string): Promise<Result<Preview, ImportError<PrecordProblem>>> => previewOf(ports, readPrecord(text))

/**
 * Take the tallies of a pRecord file into a book, as it was looked at: the
 * file is not read again, nor the catalog asked again.
 */
export const importPrecord = (ports: ImportPorts, bookId: BookId, preview: Preview, named: Named, weighing: Weighing | undefined): Promise<Result<Imported, ImportError<never>>> =>
  importTallies(ports, bookId, PRECORD, preview, named, weighing)

/**
 * Every tally of a book as pRecord's CSV, newest first, for pRecord to
 * take in. It goes by itself and never in the zip: it is for another app,
 * and the table carries the same tallies and more.
 */
export const makeForPrecord = async (ports: ExportPorts, bookId: BookId, watch: ExportWatch): Promise<Outcome<Made>> =>
  madeOf(await ofTallies(ports, bookId, watch, (lines, stored) => ({ name: fileNameOf(ownStem(stored.files, bookId), "pRecord", ports.today(), "csv"), mediaType: "text/csv", text: precordCsvOf(lines, notesOf(stored)) })))

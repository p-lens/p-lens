import type { BookId } from "../../core/book/book"
import type { Result } from "../../core/result/result"
import type { Outcome } from "../../application/errors"
import { fileNameOf } from "../core/file-name"
import { madeOf, notesOf, ofTallies, ownStem, type ExportPorts, type ExportWatch, type Made } from "../application/export"
import { importTallies, previewOf, type Imported, type ImportError, type ImportPorts, type Named, type Preview } from "../application/import"
import { pachifolioCsvOf } from "./csv-export"
import { PACHIFOLIO, readPachifolio, type PachifolioProblem } from "./csv-import"

/** A パチフォリオ file looked at before it is taken in. */
export const previewPachifolio = (ports: Pick<ImportPorts, "catalog">, text: string): Promise<Result<Preview, ImportError<PachifolioProblem>>> => previewOf(ports, readPachifolio(text))

/**
 * Take the tallies of a パチフォリオ file into a book, as it was looked at.
 * None of them says how long it lasted, so none is weighed.
 */
export const importPachifolio = (ports: ImportPorts, bookId: BookId, preview: Preview, named: Named): Promise<Result<Imported, ImportError<never>>> => importTallies(ports, bookId, PACHIFOLIO, preview, named, undefined)

/** Every tally of a book as パチフォリオ's CSV, newest first, for パチフォリオ to take in: by itself and never in the zip, as pRecord's is. */
export const makeForPachifolio = async (ports: ExportPorts, bookId: BookId, watch: ExportWatch): Promise<Outcome<Made>> =>
  madeOf(await ofTallies(ports, bookId, watch, (lines, stored) => ({ name: fileNameOf(ownStem(stored.files, bookId), "パチフォリオ", ports.today(), "csv"), mediaType: "text/csv", text: pachifolioCsvOf(lines, notesOf(stored)) })))

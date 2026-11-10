import type { BookId } from "../../core/book/book"
import type { Result } from "../../core/result/result"
import type { Outcome } from "../../application/errors"
import { fileNameOf } from "../core/file-name"
import { madeOf, notesOf, ofTallies, ownStem, type ExportPorts, type ExportWatch, type Made } from "../application/export"
import { importTallies, previewOf, type Imported, type ImportError, type ImportPorts, type Named, type Preview, type Weighing } from "../application/import"
import { manekuruCsvOf } from "./csv-export"
import { MANEKURU, readManekuru, type ManekuruProblem } from "./csv-import"

/** A マネクルSP file looked at before it is taken in. */
export const previewManekuru = (ports: Pick<ImportPorts, "catalog">, text: string): Promise<Result<Preview, ImportError<ManekuruProblem>>> => previewOf(ports, readManekuru(text))

/**
 * Take the tallies of a マネクルSP file into a book, as it was looked at:
 * weighed where a person asks, as its tallies say their minutes, but
 * those it gave a theoretical value, which keep that.
 */
export const importManekuru = (ports: ImportPorts, bookId: BookId, preview: Preview, named: Named, weighing: Weighing | undefined): Promise<Result<Imported, ImportError<never>>> =>
  importTallies(ports, bookId, MANEKURU, preview, named, weighing)

/** Every tally of a book as マネクルSP's CSV, newest first, for マネクルSP to take in: by itself and never in the zip, as pRecord's is. */
export const makeForManekuru = async (ports: ExportPorts, bookId: BookId, watch: ExportWatch): Promise<Outcome<Made>> =>
  madeOf(await ofTallies(ports, bookId, watch, (lines, stored) => ({ name: fileNameOf(ownStem(stored.files, bookId), "マネクルSP", ports.today(), "csv"), mediaType: "text/csv", text: manekuruCsvOf(lines, notesOf(stored)) })))

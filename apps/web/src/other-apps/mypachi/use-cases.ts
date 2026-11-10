import type { BookId } from "../../core/book/book"
import type { Result } from "../../core/result/result"
import type { Outcome } from "../../application/errors"
import { fileNameOf } from "../core/file-name"
import { shiftJisOf } from "../core/shift-jis"
import { madeOfBytes, notesOf, ofTallies, ownStem, type ExportPorts, type ExportWatch, type Made, type WrittenBytes } from "../application/export"
import { importTallies, previewOf, type Imported, type ImportError, type ImportPorts, type Named, type Preview, type Weighing } from "../application/import"
import { mypachiCsvOf } from "./csv-export"
import { MYPACHI, readMypachi, type MypachiProblem } from "./csv-import"

/** A Myパチ収支表 file looked at before it is taken in, as its bytes. */
export const previewMypachi = (ports: Pick<ImportPorts, "catalog">, bytes: Uint8Array): Promise<Result<Preview, ImportError<MypachiProblem>>> => previewOf(ports, readMypachi(bytes))

/** Take the tallies of a Myパチ収支表 file into a book, as it was looked at: weighed where a person asks, as its tallies say their hours, but those it gave a theoretical value, which keep that. */
export const importMypachi = (ports: ImportPorts, bookId: BookId, preview: Preview, named: Named, weighing: Weighing | undefined): Promise<Result<Imported, ImportError<never>>> =>
  importTallies(ports, bookId, MYPACHI, preview, named, weighing)

/** Every tally of a book as Myパチ収支表's 件別収支表, newest first as its own is, in Shift_JIS: by itself and never in the zip, as pRecord's is. */
export const makeForMypachi = async (ports: ExportPorts, bookId: BookId, watch: ExportWatch): Promise<Outcome<Made>> =>
  madeOfBytes(
    await ofTallies(ports, bookId, watch, (lines, stored): WrittenBytes => ({
      name: fileNameOf(ownStem(stored.files, bookId), "Myパチ収支表", ports.today(), "csv"),
      mediaType: "text/csv",
      bytes: shiftJisOf(mypachiCsvOf(lines, notesOf(stored), ports.now())),
    })),
  )

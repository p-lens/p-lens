import type { BookId } from "../../core/book/book"
import type { Result } from "../../core/result/result"
import type { Outcome } from "../../application/errors"
import { fileNameOf } from "../core/file-name"
import { shiftJisOf } from "../core/shift-jis"
import { madeOfBytes, notesOf, ofTallies, ownStem, utf8Of, type ExportPorts, type ExportWatch, type Made, type WrittenBytes } from "../application/export"
import { importTallies, previewOf, type Imported, type ImportError, type ImportPorts, type Named, type Preview, type Weighing } from "../application/import"
import { pachiboCsvOf } from "./csv-export"
import { pachiboPcbOf } from "./pcb-export"
import { PACHIBO, readPachibo, type PachiboProblem, type Utf8Reader } from "./pcb-import"

/** A ぱち簿 file (`.pcb`) looked at before it is taken in, as its bytes, read as UTF-8 by the reader given. */
export const previewPachibo = (ports: Pick<ImportPorts, "catalog">, bytes: Uint8Array, utf8: Utf8Reader): Promise<Result<Preview, ImportError<PachiboProblem>>> => previewOf(ports, readPachibo(bytes, utf8))

/** Take the tallies of a ぱち簿 file into a book, as it was looked at: weighed, where a person asked, as a pRecord file's are. */
export const importPachibo = (ports: ImportPorts, bookId: BookId, preview: Preview, named: Named, weighing: Weighing | undefined): Promise<Result<Imported, ImportError<never>>> =>
  importTallies(ports, bookId, PACHIBO, preview, named, weighing)

/** Every tally of a book as ぱち簿's CSV, oldest first, in Shift_JIS as ぱち簿's own is, for ぱち簿 to take in: by itself and never in the zip, as pRecord's is. */
export const makeForPachiboCsv = async (ports: ExportPorts, bookId: BookId, watch: ExportWatch): Promise<Outcome<Made>> =>
  madeOfBytes(
    await ofTallies(ports, bookId, watch, (lines, stored): WrittenBytes => ({
      name: fileNameOf(ownStem(stored.files, bookId), "ぱち簿", ports.today(), "csv"),
      mediaType: "text/csv",
      bytes: shiftJisOf(pachiboCsvOf(lines, notesOf(stored))),
    })),
  )

/** Every tally of a book as ぱち簿's own file (`.pcb`), for ぱち簿 to take in whole in place of what it keeps: by itself and never in the zip. */
export const makeForPachiboPcb = async (ports: ExportPorts, bookId: BookId, watch: ExportWatch): Promise<Outcome<Made>> =>
  madeOfBytes(
    await ofTallies(ports, bookId, watch, (lines, stored): WrittenBytes => ({
      name: fileNameOf(ownStem(stored.files, bookId), "ぱち簿", ports.today(), "pcb"),
      mediaType: "application/octet-stream",
      bytes: new Uint8Array(pachiboPcbOf(lines, notesOf(stored), ports.now(), utf8Of)),
    })),
  )

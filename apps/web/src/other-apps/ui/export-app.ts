import type { BookId } from "../../core/book/book"
import type { Outcome } from "../../application/errors"
import type { ExportPorts, ExportWatch, Made } from "../application/export"

/** A file made for another app, for a book: its tab's press. */
type ForApp = (ports: ExportPorts, bookId: BookId, watch: ExportWatch) => Promise<Outcome<Made>>

/** A press of another app's tab: the kind of file it says, and how that file is made for a book. */
export interface AppPress {
  readonly label: string
  readonly make: ForApp
}

/** An app tallies are written out for, as its tab offers it: the word its tab goes by, its name, what is said of its files, and a press for each. */
export interface ExportApp {
  readonly format: string
  readonly name: string
  readonly about: string
  readonly presses: readonly AppPress[]
}

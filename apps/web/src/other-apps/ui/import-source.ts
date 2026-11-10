import type { JSX } from "solid-js"

import type { BookId } from "../../core/book/book"
import type { Result } from "../../core/result/result"
import type { Imported, ImportError, Named, Preview, Weighing } from "../application/import"
import type { Mapping, Sheet } from "../general/csv-import"

/** What a person ties a sheet's columns to this app's fields on: the sheet, the mapping so far, and the press that goes on with it. */
export interface ColumnsProps {
  readonly sheet: Sheet
  readonly mapping: Mapping
  readonly onMapping: (mapping: Mapping) => void
  readonly onNext: () => void
}

/**
 * How an app's file is looked at: an app's whose columns it names itself,
 * read as UTF-8 and looked at at once; an app's of its own kind, looked at
 * at once as its bytes; or a person's own, read as UTF-8 or else as
 * Shift_JIS, as a desk's spreadsheet saves one, and looked at once its
 * columns are tied to this app's fields, first as they are guessed to go.
 */
export type Reading<P> =
  | { readonly type: "bytes"; readonly preview: (bytes: Uint8Array) => Promise<Result<Preview, ImportError<P>>> }
  | { readonly type: "named"; readonly preview: (text: string) => Promise<Result<Preview, ImportError<P>>> }
  | {
      readonly type: "mapped"
      readonly sheet: (text: string) => Result<Sheet, P>
      readonly guess: (sheet: Sheet) => Mapping
      readonly Columns: (props: ColumnsProps) => JSX.Element
      readonly preview: (sheet: Sheet, mapping: Mapping) => Promise<Result<Preview, ImportError<P>>>
    }

/**
 * An app tallies are taken in from, as its tab offers it: the word it goes
 * by, its name, what is said of it above its books and below them, the
 * press that asks for one of its files and the files offered — any, where
 * its files carry a name a phone's picker does not know — whether its
 * tallies that say no game are taken in only where the person ticks for
 * them, as an app's whose game is a tag a person may not have put on; how
 * one of its files is looked at, how what was looked at is taken into a
 * book, and why its reading of a file does not read, in its own words.
 */
export interface ImportSource<P> {
  readonly from: string
  readonly name: string
  readonly about: string
  readonly kept: string
  readonly choose: string
  readonly accept: string | undefined
  readonly asksUntagged: boolean
  readonly reading: Reading<P>
  readonly take: (bookId: BookId, preview: Preview, named: Named, weighing: Weighing | undefined) => Promise<Result<Imported, ImportError<never>>>
  readonly describe: (problem: P) => string
}

/** A file's bytes as UTF-8 text, or none where they do not read as UTF-8: a character made up in its place would be written into the book. */
export const utf8Of = (bytes: ArrayBuffer | Uint8Array): string | undefined => {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes)
  } catch {
    return undefined
  }
}

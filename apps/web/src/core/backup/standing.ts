import type { BookId } from "../book/book"
import type { BookFiles } from "../journal/layout"

/** Where a backup goes: a person's Google Drive, or a file they save wherever they choose. */
export type Destination = "google-drive" | "file"

/**
 * What a backup leaves on the device: which book, where it went, when, and
 * the fingerprint of the files it held — enough to say later whether the
 * book has changed since.
 */
export interface Receipt {
  readonly bookId: BookId
  readonly destination: Destination
  /** ISO 8601. */
  readonly at: string
  readonly fingerprint: string
}

/**
 * Where a book stands against its backups: never backed up, changed since
 * the last one, or kept — the last one holds the book as it is.
 */
export type Standing =
  | { readonly type: "never" }
  | { readonly type: "changed"; readonly receipt: Receipt }
  | { readonly type: "kept"; readonly receipt: Receipt }

/**
 * The text a book's fingerprint is taken of: every file, by path, in path
 * order, so the same files give the same text however they were gathered.
 */
export const fingerprintText = (files: BookFiles): string =>
  JSON.stringify(
    Object.keys(files)
      .toSorted()
      .map((path) => [path, files[path] ?? ""]),
  )

/** Where a book stands, from its last receipt and the fingerprint of its files now. */
export const standingOf = (receipt: Receipt | undefined, fingerprint: string): Standing => {
  if (receipt === undefined) return { type: "never" }
  return receipt.fingerprint === fingerprint ? { type: "kept", receipt } : { type: "changed", receipt }
}

/** What is worth a quiet word: a book never backed up, or one changed since. */
export type Note = "never" | "changed"

/** The one note a device's books come to: a book never backed up is said before one changed since, and books all kept say nothing. */
export const noteOf = (standings: readonly Standing[]): Note | undefined => {
  if (standings.some((standing) => standing.type === "never")) return "never"
  return standings.some((standing) => standing.type === "changed") ? "changed" : undefined
}

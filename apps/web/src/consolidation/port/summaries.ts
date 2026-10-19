import type { BookFiles } from "../../core/journal/layout"

/**
 * What a consolidation keeps of each book's answers, so that a book is not
 * opened in hledger again to be asked what it was already asked: each
 * answer under a key that says what it is of — the book's journals as they
 * stood, the day it was asked on and the question. A book written since
 * has another key, so nothing kept is ever stale; an answer under a key
 * nobody asks again is let go of in time. Only the consolidation keeps
 * anything here: one book's own screens ask hledger as they always have.
 */
export interface Summaries {
  /** What was kept under a key; nothing where none was, or it was let go of. */
  readonly kept: (key: string) => Promise<unknown>
  readonly keep: (key: string, answer: unknown) => Promise<void>
}

/** A digest of what hledger would read of a book: its journals, the same journals the same digest and any change to them another. */
export type JournalsDigest = (files: BookFiles) => Promise<string>

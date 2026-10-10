import type { BookId } from "../../core/book/book"
import type { JournalChange } from "../../core/change/journal-change"
import type { Result } from "../../core/result/result"

export type CommitId = string & { readonly __brand: "CommitId" }

export interface Commit {
  readonly id: CommitId
  readonly change: JournalChange
}

export type HistoryError = { readonly type: "unavailable"; readonly detail: string }

/**
 * The history of a book: every change, recorded as one commit. Git is the
 * model this is shaped after; which Git, or whether any, is an adapter's to
 * decide, and nothing in the app names one.
 */
export interface HistoryPort {
  /** Let go of everything kept of a book: the book is leaving the device. */
  readonly forget: (book: BookId) => Promise<Result<void, HistoryError>>
  readonly commit: (change: JournalChange) => Promise<Result<CommitId, HistoryError>>
  /** Newest first. */
  readonly log: (book: BookId) => Promise<Result<readonly Commit[], HistoryError>>
  /** A book's commits that are on no line yet, oldest first: all of them, for a book that is not synced. */
  readonly unsent: (book: BookId) => Promise<Result<readonly Commit[], HistoryError>>
  /**
   * Take in a book's line, as one: the commits received from it, in its
   * order, then the book's unsent commits as made again on top of them, in
   * place of the unsent commits as they were.
   */
  readonly reconcile: (book: BookId, received: readonly Commit[], rebased: readonly Commit[]) => Promise<Result<void, HistoryError>>
  /** Say none of a book's commits is on its line: the line is gone, or was made again, and is to be met from its start. */
  readonly unsend: (book: BookId) => Promise<Result<void, HistoryError>>
  /** Say these commits of a book are on its line now. */
  readonly sent: (book: BookId, ids: readonly CommitId[]) => Promise<Result<void, HistoryError>>
}

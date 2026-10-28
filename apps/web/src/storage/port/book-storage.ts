import type { Book, BookId } from "../../core/book/book"
import type { FileChange } from "../../core/change/journal-change"
import type { BookFiles } from "../../core/journal/layout"
import type { Result } from "../../core/result/result"

/** What a device keeps that can be found broken as it is read back. */
export type KeptKind = "book-cover" | "draft" | "followed" | "submission" | "backup-receipt"

export type StorageError =
  | { readonly type: "unavailable"; readonly detail: string }
  | { readonly type: "unreadable"; readonly kept: KeptKind }
  | { readonly type: "book-missing"; readonly bookId: BookId }
  | { readonly type: "book-exists"; readonly bookId: BookId }
  | { readonly type: "changed-elsewhere"; readonly path: string }

export interface StoredBook {
  readonly book: Book
  readonly files: BookFiles
}

/**
 * Where a device keeps its books. A container for journal files and their
 * covers, never the source of any figure: everything worth knowing about a
 * book is asked of hledger, from these files.
 */
export interface BookStorage {
  readonly listBooks: () => Promise<Result<readonly Book[], StorageError>>
  readonly readBook: (id: BookId) => Promise<Result<StoredBook, StorageError>>
  readonly createBook: (stored: StoredBook) => Promise<Result<void, StorageError>>
  /**
   * Write changed files, all or none, and only if each still reads as the
   * change says it did before. Text composed from an older copy — another tab
   * wrote in between — is refused rather than written over what it missed.
   */
  /** Take a book off the device, its files with it. A book that is not there is already gone. */
  readonly deleteBook: (id: BookId) => Promise<Result<void, StorageError>>
  readonly applyChanges: (id: BookId, changes: readonly FileChange[]) => Promise<Result<void, StorageError>>
}

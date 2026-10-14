import type { Book, BookId, Member } from "../../core/book/book"
import type { FileChange } from "../../core/change/journal-change"
import { Err, Ok, collect, type Result } from "../../core/result/result"
import type { PlayDraft } from "../../core/live-play/draft"
import { readPlayDraft } from "../../core/live-play/draft-reading"
import type { PlayId } from "../../core/play/play"
import type { BookStorage, StorageError, StoredBook } from "../port/book-storage"
import type { DraftError, DraftStorage } from "../port/draft-storage"
import {
  BOOKS,
  type Connection,
  DRAFTS,
  FILES,
  FILES_BY_BOOK,
  type FileRecord,
  abandon,
  completionOf,
  filesOf,
  resultOf,
  staleChange,
} from "./database"

type Fields = Readonly<Record<string, unknown>>

const isFields = (value: unknown): value is Fields => typeof value === "object" && value !== null && !Array.isArray(value)

const ROLES: ReadonlySet<unknown> = new Set(["owner", "editor", "viewer"])

const isMember = (value: unknown): value is Member =>
  isFields(value) && typeof value["id"] === "string" && typeof value["displayName"] === "string" && ROLES.has(value["role"])

/** A cover as the store gave it back, or that it does not read as one: a cover is a book's id and its members, each named and given a role. */
const coverOf = (value: unknown): Result<Book, StorageError> =>
  isFields(value) && typeof value["id"] === "string" && Array.isArray(value["members"]) && value["members"].every(isMember)
    ? Ok({ id: value["id"] as BookId, members: value["members"] })
    : Err({ type: "unreadable", kept: "book-cover" })

export const createIndexedDbStorage = (database: Connection): BookStorage => {
  const listBooks = async (): Promise<Result<readonly Book[], StorageError>> => {
    const opened = await database()
    if (!opened.ok) return opened
    const books = await resultOf<unknown[]>(opened.value.transaction(BOOKS).objectStore(BOOKS).getAll())
    return books.ok ? collect((books.value ?? []).map(coverOf)) : books
  }

  const readBook = async (id: BookId): Promise<Result<StoredBook, StorageError>> => {
    const opened = await database()
    if (!opened.ok) return opened
    const transaction = opened.value.transaction([BOOKS, FILES])
    const kept = await resultOf<unknown>(transaction.objectStore(BOOKS).get(id))
    if (!kept.ok) return kept
    if (kept.value === undefined) return Err({ type: "book-missing", bookId: id })
    const book = coverOf(kept.value)
    if (!book.ok) return book
    const records = await resultOf<FileRecord[]>(transaction.objectStore(FILES).index(FILES_BY_BOOK).getAll(id))
    return records.ok ? Ok({ book: book.value, files: filesOf(records.value ?? []) }) : records
  }

  const createBook = async (stored: StoredBook): Promise<Result<void, StorageError>> => {
    const opened = await database()
    if (!opened.ok) return opened
    const transaction = opened.value.transaction([BOOKS, FILES], "readwrite")
    const done = completionOf(transaction)
    const existing = await resultOf<Book>(transaction.objectStore(BOOKS).get(stored.book.id))
    if (!existing.ok) return abandon(transaction, done, existing.error)
    if (existing.value !== undefined) return abandon(transaction, done, { type: "book-exists", bookId: stored.book.id })
    transaction.objectStore(BOOKS).put(stored.book)
    Object.entries(stored.files).forEach(([path, text]) =>
      transaction.objectStore(FILES).put({ bookId: stored.book.id, path, text } satisfies FileRecord),
    )
    return done
  }

  const applyChanges = async (id: BookId, changes: readonly FileChange[]): Promise<Result<void, StorageError>> => {
    const opened = await database()
    if (!opened.ok) return opened
    const transaction = opened.value.transaction(FILES, "readwrite")
    const done = completionOf(transaction)
    const files = transaction.objectStore(FILES)
    const stale = await staleChange(files, id, changes)
    if (!stale.ok) return abandon(transaction, done, stale.error)
    if (stale.value !== undefined) return abandon(transaction, done, { type: "changed-elsewhere", path: stale.value.path })
    changes.forEach((change) => files.put({ bookId: id, path: change.path, text: change.after } satisfies FileRecord))
    return done
  }

  const deleteBook = async (id: BookId): Promise<Result<void, StorageError>> => {
    const opened = await database()
    if (!opened.ok) return opened
    const transaction = opened.value.transaction([BOOKS, FILES], "readwrite")
    const done = completionOf(transaction)
    const files = transaction.objectStore(FILES)
    const paths = await resultOf<IDBValidKey[]>(files.index(FILES_BY_BOOK).getAllKeys(id))
    if (!paths.ok) return abandon(transaction, done, paths.error)
    ;(paths.value ?? []).forEach((key) => files.delete(key))
    transaction.objectStore(BOOKS).delete(id)
    return done
  }

  return { listBooks, readBook, createBook, deleteBook, applyChanges }
}

/**
 * A draft as it was kept, or that it does not read as one. One kept before
 * a pachinko play's formula went under its game's name still has it as
 * `formula`.
 */
const draftOf = (kept: unknown): Result<PlayDraft, DraftError> => {
  const { formula, ...rest } = isFields(kept) ? kept : {}
  const draft = isFields(kept) ? readPlayDraft({ ...rest, pachinko: rest["pachinko"] ?? formula }) : undefined
  return draft === undefined ? Err({ type: "unreadable", kept: "draft" }) : Ok(draft)
}

export const createIndexedDbDrafts = (database: Connection): DraftStorage => {
  const listDrafts = async (): Promise<Result<readonly PlayDraft[], DraftError>> => {
    const opened = await database()
    if (!opened.ok) return opened
    const drafts = await resultOf<unknown[]>(opened.value.transaction(DRAFTS).objectStore(DRAFTS).getAll())
    return drafts.ok ? collect((drafts.value ?? []).map(draftOf)) : drafts
  }

  const readDraft = async (id: PlayId): Promise<Result<PlayDraft, DraftError>> => {
    const opened = await database()
    if (!opened.ok) return opened
    const draft = await resultOf<unknown>(opened.value.transaction(DRAFTS).objectStore(DRAFTS).get(id))
    if (!draft.ok) return draft
    return draft.value === undefined ? Err({ type: "draft-missing", playId: id }) : draftOf(draft.value)
  }

  const createDraft = async (draft: PlayDraft): Promise<Result<void, DraftError>> => {
    const opened = await database()
    if (!opened.ok) return opened
    const transaction = opened.value.transaction(DRAFTS, "readwrite")
    transaction.objectStore(DRAFTS).add(draft)
    return completionOf(transaction)
  }

  const updateDraft = async (draft: PlayDraft, previousLog: string): Promise<Result<void, DraftError>> => {
    const opened = await database()
    if (!opened.ok) return opened
    const transaction = opened.value.transaction(DRAFTS, "readwrite")
    const done = completionOf(transaction)
    const drafts = transaction.objectStore(DRAFTS)
    const current = await resultOf<PlayDraft>(drafts.get(draft.id))
    if (!current.ok) return abandon(transaction, done, current.error)
    if (current.value === undefined) return abandon(transaction, done, { type: "draft-missing", playId: draft.id })
    if (current.value.log !== previousLog) return abandon(transaction, done, { type: "changed-elsewhere", path: draft.id })
    drafts.put(draft)
    return done
  }

  const deleteDraft = async (id: PlayId): Promise<Result<void, DraftError>> => {
    const opened = await database()
    if (!opened.ok) return opened
    const transaction = opened.value.transaction(DRAFTS, "readwrite")
    transaction.objectStore(DRAFTS).delete(id)
    return completionOf(transaction)
  }

  return { listDrafts, readDraft, createDraft, updateDraft, deleteDraft }
}

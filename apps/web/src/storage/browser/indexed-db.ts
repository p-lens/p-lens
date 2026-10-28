import type { Book, BookId, Member } from "../../core/book/book"
import { parseIsoDate } from "../../core/calendar/calendar"
import type { FileChange } from "../../core/change/journal-change"
import { Err, Ok, collect, type Result } from "../../core/result/result"
import type { PlayDraft } from "../../core/live-play/draft"
import { readPlayDraft } from "../../core/live-play/draft-reading"
import type { DeviceId } from "../../core/play-line/device"
import { readShownPlay } from "../../core/play-line/entry"
import type { Followed } from "../../core/play-line/following"
import type { PlayId } from "../../core/play/play"
import type { BookStorage, StorageError, StoredBook } from "../port/book-storage"
import type { DraftError, DraftStorage } from "../port/draft-storage"
import type { FollowStorage } from "../port/follow-storage"
import {
  BOOKS,
  type Connection,
  DRAFTS,
  FILES,
  FILES_BY_BOOK,
  FOLLOWED,
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

/** Why a play is not among those the device holds: it keeps a copy of it, another device holding it, or it has none. */
const missingOrElsewhere = async (followed: IDBObjectStore, id: PlayId): Promise<Result<DraftError, DraftError>> => {
  const copy = await resultOf(followed.getKey(id))
  if (!copy.ok) return copy
  return Ok(copy.value === undefined ? { type: "draft-missing", playId: id } : { type: "held-elsewhere", playId: id })
}

/**
 * A draft about to be written over one kept, with the handovers the kept
 * one has: how often a play passed between the owner's devices is the
 * store's to keep, never a screen's or a sending's to set, so a play
 * written whole from elsewhere — a later sending taking its place — is
 * not taken for one that never passed.
 */
const withHandoversOf = (kept: PlayDraft, draft: PlayDraft): PlayDraft => {
  const { handovers: _handovers, ...rest } = draft
  return kept.handovers === undefined ? rest : { ...rest, handovers: kept.handovers }
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
    const transaction = opened.value.transaction([DRAFTS, FOLLOWED])
    const draft = await resultOf<unknown>(transaction.objectStore(DRAFTS).get(id))
    if (!draft.ok) return draft
    if (draft.value !== undefined) return draftOf(draft.value)
    const missing = await missingOrElsewhere(transaction.objectStore(FOLLOWED), id)
    return missing.ok ? Err(missing.value) : missing
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
    const transaction = opened.value.transaction([DRAFTS, FOLLOWED], "readwrite")
    const done = completionOf(transaction)
    const drafts = transaction.objectStore(DRAFTS)
    const current = await resultOf<PlayDraft>(drafts.get(draft.id))
    if (!current.ok) return abandon(transaction, done, current.error)
    if (current.value === undefined) {
      const missing = await missingOrElsewhere(transaction.objectStore(FOLLOWED), draft.id)
      return abandon(transaction, done, missing.ok ? missing.value : missing.error)
    }
    if (current.value.log !== previousLog) return abandon(transaction, done, { type: "changed-elsewhere", path: draft.id })
    drafts.put(withHandoversOf(current.value, draft))
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

const isText = (value: unknown): value is string => typeof value === "string" && value !== ""

const isLine = (value: unknown): value is Followed["line"] => isFields(value) && isText(value["bookId"]) && isText(value["day"]) && parseIsoDate(value["day"]).ok

/** A copy as it was kept, or that it does not read as one: a play shown on a line, by whom, when and on which. */
const followedOf = (kept: unknown): Result<Followed, DraftError> => {
  const play = isFields(kept) ? readShownPlay(kept["play"]) : undefined
  return isFields(kept) && play !== undefined && kept["id"] === play.id && isText(kept["holder"]) && isText(kept["shownAt"]) && isLine(kept["line"])
    ? Ok({ id: play.id, play, holder: kept["holder"] as DeviceId, shownAt: kept["shownAt"], line: kept["line"] })
    : Err({ type: "unreadable", kept: "followed" })
}

/**
 * Copies of the plays the owner's other devices hold, kept beside the
 * plays this device holds. A play passes between the two in one
 * transaction, written as it is: passing is no change of its log, and
 * writes nothing into its history. A copy is never kept of a play the
 * device holds — one taken up while a copy was on its way stays held —
 * and a play is given up only while its log is the one the device
 * weighed giving it up by, so a reading typed meanwhile is not lost
 * uncounted.
 */
export const createIndexedDbFollow = (database: Connection): FollowStorage => {
  const listFollowed = async (): Promise<Result<readonly Followed[], DraftError>> => {
    const opened = await database()
    if (!opened.ok) return opened
    const kept = await resultOf<unknown[]>(opened.value.transaction(FOLLOWED).objectStore(FOLLOWED).getAll())
    return kept.ok ? collect((kept.value ?? []).map(followedOf)) : kept
  }

  const readFollowed = async (id: PlayId): Promise<Result<Followed | undefined, DraftError>> => {
    const opened = await database()
    if (!opened.ok) return opened
    const kept = await resultOf<unknown>(opened.value.transaction(FOLLOWED).objectStore(FOLLOWED).get(id))
    if (!kept.ok) return kept
    return kept.value === undefined ? Ok(undefined) : followedOf(kept.value)
  }

  const putFollowed = async (followed: Followed): Promise<Result<void, DraftError>> => {
    const opened = await database()
    if (!opened.ok) return opened
    const transaction = opened.value.transaction([DRAFTS, FOLLOWED], "readwrite")
    const done = completionOf(transaction)
    const held = await resultOf(transaction.objectStore(DRAFTS).getKey(followed.id))
    if (!held.ok) return abandon(transaction, done, held.error)
    if (held.value === undefined) transaction.objectStore(FOLLOWED).put(followed)
    return done
  }

  const dropFollowed = async (id: PlayId): Promise<Result<void, DraftError>> => {
    const opened = await database()
    if (!opened.ok) return opened
    const transaction = opened.value.transaction(FOLLOWED, "readwrite")
    transaction.objectStore(FOLLOWED).delete(id)
    return completionOf(transaction)
  }

  const takeUp = async (followed: Followed): Promise<Result<PlayDraft, DraftError>> => {
    const opened = await database()
    if (!opened.ok) return opened
    const transaction = opened.value.transaction([DRAFTS, FOLLOWED], "readwrite")
    const done = completionOf(transaction)
    const held = await resultOf<unknown>(transaction.objectStore(DRAFTS).get(followed.id))
    if (!held.ok) return abandon(transaction, done, held.error)
    const draft = held.value === undefined ? Ok<PlayDraft>(followed.play) : draftOf(held.value)
    if (!draft.ok) return abandon(transaction, done, draft.error)
    transaction.objectStore(FOLLOWED).delete(followed.id)
    transaction.objectStore(DRAFTS).put(draft.value)
    const taken = await done
    return taken.ok ? Ok(draft.value) : taken
  }

  const yieldUp = async (id: PlayId, followed: Followed, previousLog: string): Promise<Result<void, DraftError>> => {
    const opened = await database()
    if (!opened.ok) return opened
    const transaction = opened.value.transaction([DRAFTS, FOLLOWED], "readwrite")
    const done = completionOf(transaction)
    const held = await resultOf<PlayDraft>(transaction.objectStore(DRAFTS).get(id))
    if (!held.ok) return abandon(transaction, done, held.error)
    if (held.value !== undefined && held.value.log !== previousLog) return abandon(transaction, done, { type: "changed-elsewhere", path: id })
    transaction.objectStore(DRAFTS).delete(id)
    transaction.objectStore(FOLLOWED).put(followed)
    return done
  }

  const claimBack = async (id: PlayId, handovers: number, previousLog: string): Promise<Result<void, DraftError>> => {
    const opened = await database()
    if (!opened.ok) return opened
    const transaction = opened.value.transaction([DRAFTS, FOLLOWED], "readwrite")
    const done = completionOf(transaction)
    const held = await resultOf<PlayDraft>(transaction.objectStore(DRAFTS).get(id))
    if (!held.ok) return abandon(transaction, done, held.error)
    if (held.value === undefined) {
      const missing = await missingOrElsewhere(transaction.objectStore(FOLLOWED), id)
      return abandon(transaction, done, missing.ok ? missing.value : missing.error)
    }
    if (held.value.log !== previousLog) return abandon(transaction, done, { type: "changed-elsewhere", path: id })
    transaction.objectStore(DRAFTS).put({ ...held.value, handovers })
    return done
  }

  return { listFollowed, readFollowed, putFollowed, dropFollowed, takeUp, yieldUp, claimBack }
}

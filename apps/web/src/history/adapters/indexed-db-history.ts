import type { BookId } from "../../core/book/book"
import { type FilePatch, patchBetween } from "../../core/change/patch"
import { type Result, mapErr, mapOk } from "../../core/result/result"
import { COMMITS, COMMITS_BY_BOOK, type Connection, completionOf, resultOf } from "../../storage/browser/database"
import type { StorageError } from "../../storage/port/book-storage"
import type { Commit, CommitId, HistoryError, HistoryPort } from "../port/history-port"

/**
 * A commit as it is kept: beside its book, so a book's are found, under the
 * order IndexedDB counts it in, and with whether it is on its book's line.
 */
interface CommitRecord {
  readonly order: number
  readonly bookId: BookId
  readonly commit: Commit
  readonly onLine: boolean
}

type NewRecord = Omit<CommitRecord, "order">

/** A file as a commit kept it before commits kept patches: its text whole, before and after. */
interface WholeFile {
  readonly path: string
  readonly before: string | undefined
  readonly after: string
}

const patchOfKept = (file: FilePatch | WholeFile): FilePatch => ("hunks" in file ? file : patchBetween(file.path, file.before, file.after))

/** A commit as it is read: one kept with its files whole is read as the patches they come to. */
const commitOf = (record: CommitRecord): Commit => ({ ...record.commit, change: { ...record.commit.change, files: record.commit.change.files.map(patchOfKept) } })

const fromStorage = <T>(result: Result<T, StorageError>): Result<T, HistoryError> =>
  mapErr(result, (error) => ({ type: "unavailable", detail: error.type === "unavailable" ? error.detail : error.type }))

const oldestFirst = (records: readonly CommitRecord[]): readonly CommitRecord[] => records.toSorted((left, right) => left.order - right.order)

const recordsOf = async (store: IDBObjectStore, book: BookId): Promise<Result<readonly CommitRecord[], HistoryError>> =>
  mapOk(fromStorage(await resultOf<CommitRecord[]>(store.index(COMMITS_BY_BOOK).getAll(book))), (found) => oldestFirst(found ?? []))

/**
 * History kept on this device, in the database the books are in: every
 * change one record, in the order made, there after a reload and after the
 * app is closed.
 */
export const createIndexedDbHistory = (database: Connection, nextId: () => string): HistoryPort => {
  const reading = async (book: BookId): Promise<Result<readonly CommitRecord[], HistoryError>> => {
    const opened = fromStorage(await database())
    return opened.ok ? recordsOf(opened.value.transaction(COMMITS).objectStore(COMMITS), book) : opened
  }

  /** Change a book's records inside one transaction: read them, then put and delete, all or none. */
  const rewriting = async (book: BookId, rewrite: (store: IDBObjectStore, records: readonly CommitRecord[]) => void): Promise<Result<void, HistoryError>> => {
    const opened = fromStorage(await database())
    if (!opened.ok) return opened
    const transaction = opened.value.transaction(COMMITS, "readwrite")
    const done = completionOf(transaction)
    const store = transaction.objectStore(COMMITS)
    const records = await recordsOf(store, book)
    if (!records.ok) return records
    rewrite(store, records.value)
    return fromStorage(await done)
  }

  return {
    commit: async (change) => {
      const opened = fromStorage(await database())
      if (!opened.ok) return opened
      const id = nextId() as CommitId
      const transaction = opened.value.transaction(COMMITS, "readwrite")
      const done = completionOf(transaction)
      transaction.objectStore(COMMITS).add({ bookId: change.bookId, commit: { id, change }, onLine: false } satisfies NewRecord)
      return mapOk(fromStorage(await done), () => id)
    },

    forget: (book) => rewriting(book, (store, records) => records.forEach((record) => store.delete(record.order))),

    log: async (book) => mapOk(await reading(book), (records) => records.map(commitOf).toReversed()),

    unsent: async (book) => mapOk(await reading(book), (records) => records.filter((record) => !record.onLine).map(commitOf)),

    reconcile: (book, received, rebased) =>
      rewriting(book, (store, records) => {
        records.filter((record) => !record.onLine).forEach((record) => store.delete(record.order))
        received.forEach((commit) => store.add({ bookId: book, commit, onLine: true } satisfies NewRecord))
        rebased.forEach((commit) => store.add({ bookId: book, commit, onLine: false } satisfies NewRecord))
      }),

    unsend: (book) =>
      rewriting(book, (store, records) => {
        records.filter((record) => record.onLine).forEach((record) => store.put({ ...record, onLine: false } satisfies CommitRecord))
      }),

    sent: (book, ids) =>
      rewriting(book, (store, records) => {
        records.filter((record) => ids.includes(record.commit.id)).forEach((record) => store.put({ ...record, onLine: true } satisfies CommitRecord))
      }),
  }
}

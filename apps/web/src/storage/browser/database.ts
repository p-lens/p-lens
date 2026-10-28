import type { BookId } from "../../core/book/book"
import type { FileChange } from "../../core/change/journal-change"
import { Err, Ok, collect, mapOk, type Result } from "../../core/result/result"
import type { StorageError } from "../port/book-storage"

/**
 * The whole database, in one place, because IndexedDB versions all of it at
 * once: its name, its version, and its stores.
 *
 * - `books`: a book's cover, keyed by its id.
 * - `files`: one journal file, keyed by `[bookId, path]`, indexed by book.
 * - `drafts`: a play still being played, keyed by its id. Added in version 2.
 * - `shared-parlors`: the parlor list as last read, kept whole as one record.
 *   Added in version 4.
 * - `submissions`: parlors this device submitted to the list, keyed by their
 *   submission id. Added in version 5.
 * - `catalog`: the shared catalog of both games as last delivered, kept whole
 *   as one record with its version. Added in version 8, when the catalog
 *   became one, shared by every device; the device-only catalogs before it —
 *   pachinko's from version 3, pachislot's from version 6 — are dropped.
 * - `catalog-mine`: a device's own marks on a formula or 設定配分. Added in
 *   version 8 and dropped in version 12: a person's marks are in their
 *   book.
 * - `catalog-outbox`: marks and uses waiting to be sent to the shared
 *   catalog, keyed by a UUIDv7 so they go in the order they were made. Added
 *   in version 8.
 * - `device`: this device's own ids, each made once and kept by what it is
 *   for: the name it writes to the shared catalog under, and the name it
 *   goes by on its owner's plays' lines. Added in version 8, with the
 *   catalog's alone.
 * - `commits`: every change kept of every book, one record a commit, keyed
 *   by a count that only grows — the order they were made in — and indexed
 *   by book. Added in version 9; a book older than that has files and no
 *   commits before it.
 * - `sync-links`: which books are synced, each with its relay, its secret
 *   and how far along its line this device has come, keyed by the book.
 *   Added in version 9.
 * - `backup-receipts`: what each book's last backup left — where it went,
 *   when, and the fingerprint of the files it held — keyed by the book.
 *   Added in version 10.
 * - `invitations`: whom a book's owner let into it, as this device
 *   remembers them — a name, what they may do, the code they were handed —
 *   keyed by the grant's id and indexed by book. Added in version 11.
 * - `destinations`: the books of other people this device may send plays
 *   to, each by the invitation that lets it, keyed by the inbox line.
 *   Added in version 11.
 * - `consolidation-answers`: what the consolidation was answered of each
 *   book, keyed by what it is of (the book's journals, the day and the
 *   question), indexed by when it was kept so the oldest go first; nothing
 *   in it is a book's, and it can be dropped whole. Added in version 13.
 * - `followed`: copies of the plays the owner's other devices hold, keyed
 *   by the play's id: a play is here or in `drafts`, never both. Added in
 *   version 14.
 */
const DATABASE = "p-lens"
/** Where a device once kept its own marks on the catalog; a person's marks are in their book now. */
const MARKS_ONCE_KEPT = "catalog-mine"

const VERSION = 14
export const BOOKS = "books"
export const FILES = "files"
export const FILES_BY_BOOK = "by-book"
export const DRAFTS = "drafts"
export const SHARED_PARLORS = "shared-parlors"
export const SUBMISSIONS = "submissions"
export const CATALOG = "catalog"
export const CATALOG_OUTBOX = "catalog-outbox"
export const DEVICE = "device"
export const COMMITS = "commits"
export const COMMITS_BY_BOOK = "by-book"
export const SYNC_LINKS = "sync-links"
export const BACKUP_RECEIPTS = "backup-receipts"
export const INVITATIONS = "invitations"
export const INVITATIONS_BY_BOOK = "by-book"
export const DESTINATIONS = "destinations"
export const CONSOLIDATION_ANSWERS = "consolidation-answers"
export const CONSOLIDATION_ANSWERS_BY_KEPT = "by-kept"
export const FOLLOWED = "followed"

/** The pachinko stores version 3 made, dropped with the pachislot ones when the catalog became one. */
const PACHINKO_STORES = ["machines", "formulas", "formula-marks", "formula-uses"] as const

/** How a store is made: its key, and an index if it has one. */
interface StoreShape {
  readonly keyPath: string | readonly string[]
  readonly index?: { readonly name: string; readonly keyPath: string }
}

/** The pachislot stores, each with the name version 6 gave it. */
const PACHISLOT_STORES: readonly { readonly name: string; readonly before: string; readonly shape: StoreShape }[] = [
  { name: "pachislot-machines", before: "pachislo-machines", shape: { keyPath: "id" } },
  { name: "pachislot-formulas", before: "pachislo-formulas", shape: { keyPath: "id", index: { name: "by-machine", keyPath: "machineId" } } },
  { name: "pachislot-distributions", before: "pachislo-distributions", shape: { keyPath: "id", index: { name: "by-machine", keyPath: "machineId" } } },
  { name: "pachislot-marks", before: "pachislo-marks", shape: { keyPath: ["targetId", "mark"] } },
  { name: "pachislot-uses", before: "pachislo-uses", shape: { keyPath: "id", index: { name: "by-target", keyPath: "targetId" } } },
]

const made = (database: IDBDatabase, name: string, shape: StoreShape): IDBObjectStore => {
  const store = database.createObjectStore(name, { keyPath: typeof shape.keyPath === "string" ? shape.keyPath : [...shape.keyPath] })
  if (shape.index !== undefined) store.createIndex(shape.index.name, shape.index.keyPath)
  return store
}

/**
 * A store made under its new name, every record of the old one put into it,
 * and the old one dropped once the last is. A later version may drop the new
 * store while the copy runs — a device going from version 6 straight past
 * version 8 — and then the records are simply not put.
 */
const moved = (database: IDBDatabase, transaction: IDBTransaction, store: (typeof PACHISLOT_STORES)[number]): void => {
  const target = made(database, store.name, store.shape)
  const cursor = transaction.objectStore(store.before).openCursor()
  cursor.onsuccess = () => {
    const at = cursor.result
    if (at === null) {
      database.deleteObjectStore(store.before)
      return
    }
    if (database.objectStoreNames.contains(store.name)) target.put(at.value)
    at.continue()
  }
}

export interface FileRecord {
  readonly bookId: BookId
  readonly path: string
  readonly text: string
}

export const unavailable = (cause: unknown): StorageError => ({ type: "unavailable", detail: String(cause) })

/** Each version's stores, added in order from whichever version the device had. */
const MIGRATIONS: readonly ((database: IDBDatabase, transaction: IDBTransaction) => void)[] = [
  (database) => {
    database.createObjectStore(BOOKS, { keyPath: "id" })
    database.createObjectStore(FILES, { keyPath: ["bookId", "path"] }).createIndex(FILES_BY_BOOK, "bookId")
  },
  (database) => {
    database.createObjectStore(DRAFTS, { keyPath: "id" })
  },
  (database) => {
    database.createObjectStore("machines", { keyPath: "id" })
    database.createObjectStore("formulas", { keyPath: "id" }).createIndex("by-machine", "machineId")
    database.createObjectStore("formula-marks", { keyPath: ["formulaId", "mark"] })
    database.createObjectStore("formula-uses", { keyPath: "id" }).createIndex("by-formula", "formulaId")
  },
  (database) => {
    database.createObjectStore(SHARED_PARLORS, { keyPath: "id" })
  },
  (database) => {
    database.createObjectStore(SUBMISSIONS, { keyPath: "submission" })
  },
  (database) => {
    PACHISLOT_STORES.forEach((store) => made(database, store.before, store.shape))
  },
  (database, transaction) => {
    PACHISLOT_STORES.forEach((store) => moved(database, transaction, store))
  },
  (database) => {
    ;[...PACHINKO_STORES, ...PACHISLOT_STORES.map((store) => store.name)]
      .filter((name) => database.objectStoreNames.contains(name))
      .forEach((name) => database.deleteObjectStore(name))
    database.createObjectStore(CATALOG, { keyPath: "key" })
    database.createObjectStore(MARKS_ONCE_KEPT, { keyPath: "targetId" })
    database.createObjectStore(CATALOG_OUTBOX, { keyPath: "id" })
    database.createObjectStore(DEVICE, { keyPath: "key" })
  },
  (database) => {
    database.createObjectStore(COMMITS, { keyPath: "order", autoIncrement: true }).createIndex(COMMITS_BY_BOOK, "bookId")
    database.createObjectStore(SYNC_LINKS, { keyPath: "bookId" })
  },
  (database) => {
    database.createObjectStore(BACKUP_RECEIPTS, { keyPath: "bookId" })
  },
  (database) => {
    database.createObjectStore(INVITATIONS, { keyPath: "id" }).createIndex(INVITATIONS_BY_BOOK, "bookId")
    database.createObjectStore(DESTINATIONS, { keyPath: "lineId" })
  },
  (database) => {
    database.deleteObjectStore(MARKS_ONCE_KEPT)
  },
  (database) => {
    database.createObjectStore(CONSOLIDATION_ANSWERS, { keyPath: "key" }).createIndex(CONSOLIDATION_ANSWERS_BY_KEPT, "kept")
  },
  (database) => {
    database.createObjectStore(FOLLOWED, { keyPath: "id" })
  },
]

const upgrade = (database: IDBDatabase, transaction: IDBTransaction, fromVersion: number): void =>
  MIGRATIONS.slice(fromVersion).forEach((migrate) => migrate(database, transaction))

const openDatabase = (): Promise<Result<IDBDatabase, StorageError>> =>
  new Promise((settle) => {
    try {
      const request = indexedDB.open(DATABASE, VERSION)
      request.onupgradeneeded = (event) => {
        if (request.transaction !== null) upgrade(request.result, request.transaction, event.oldVersion)
      }
      request.onsuccess = () => settle(Ok(request.result))
      request.onerror = () => settle(Err(unavailable(request.error)))
      request.onblocked = () => settle(Err(unavailable("blocked by another open copy of the app")))
    } catch (cause) {
      settle(Err(unavailable(cause)))
    }
  })

/** A request's result as a value; `null` from IndexedDB becomes `undefined` here. */
export const resultOf = <T>(request: IDBRequest<T>): Promise<Result<T | undefined, StorageError>> =>
  new Promise((settle) => {
    request.onsuccess = () => settle(Ok(request.result ?? undefined))
    request.onerror = () => settle(Err(unavailable(request.error)))
  })

export const completionOf = (transaction: IDBTransaction): Promise<Result<void, StorageError>> =>
  new Promise((settle) => {
    transaction.oncomplete = () => settle(Ok(undefined))
    transaction.onerror = () => settle(Err(unavailable(transaction.error)))
    transaction.onabort = () => settle(Err(unavailable(transaction.error ?? "aborted")))
  })

export const filesOf = (records: readonly FileRecord[]): Readonly<Record<string, string>> =>
  Object.fromEntries(records.map((record) => [record.path, record.text]))

/**
 * Whether every change still starts from the text stored, read inside the same
 * transaction that writes it so nothing can land in between.
 */
export const staleChange = async (
  files: IDBObjectStore,
  id: BookId,
  changes: readonly FileChange[],
): Promise<Result<FileChange | undefined, StorageError>> => {
  const current = collect(await Promise.all(changes.map((change) => resultOf<FileRecord>(files.get([id, change.path])))))
  return mapOk(current, (records) => changes.find((change, index) => records[index]?.text !== change.before))
}

/** Give up a write transaction and say why. */
export const abandon = async <T, E>(
  transaction: IDBTransaction,
  done: Promise<Result<void, StorageError>>,
  error: E,
): Promise<Result<T, E>> => {
  transaction.abort()
  await done
  return Err(error)
}

/** The way to the open database, shared by every store's adapter. */
export type Connection = () => Promise<Result<IDBDatabase, StorageError>>

/**
 * One connection to the database, kept once it opens. A failure is not kept,
 * so the next call tries again.
 */
export const createConnection = (): Connection => {
  const connection: { database: Promise<Result<IDBDatabase, StorageError>> | undefined } = { database: undefined }
  const forgetIfFailed = (opened: Result<IDBDatabase, StorageError>): Result<IDBDatabase, StorageError> => {
    if (!opened.ok) connection.database = undefined
    return opened
  }
  return () => {
    const opened = connection.database ?? openDatabase().then(forgetIfFailed)
    connection.database = opened
    return opened
  }
}


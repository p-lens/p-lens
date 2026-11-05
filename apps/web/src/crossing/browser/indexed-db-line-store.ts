import type { BookId } from "../../core/book/book"
import type { BookFiles } from "../../core/journal/layout"
import { Err, Ok, type Result } from "../../core/result/result"
import type { NostrEvent } from "../core/event"
import type { BookLink, Destination, HeldChange, KeptPlay, LineStore, LineStoreError, SentPlay } from "../port/line-store"

/**
 * The database what crosses devices keeps, apart from the app's own, so
 * that nothing here can stand in the way of the app's opening, and it can be
 * let go of whole.
 *
 * - `links`: a book's link to its line, keyed by the book.
 * - `changes`: the changes held of each line, keyed by `[bookId, id]`.
 * - `shadow`: each file of the state a book's link head leaves, keyed by `[bookId, path]`.
 * - `outbox`: signed events waiting for the relay to keep them, keyed by `[bookId, id]`.
 * - `loose`: events waiting for a manifest to name them as its parts, keyed by `[bookId, id]`.
 * - `plays`: the plays each line carries that the device holds or follows, keyed by `[bookId, key]`, the key the play's id.
 * - `destinations`: the books the device sends plays to, keyed by their invitation.
 * - `sent-plays`: the plays the device sends, keyed by the play's id.
 */
export const CROSSING_DATABASE = "p-lens-crossing"
const VERSION = 3
const LINKS = "links"
const CHANGES = "changes"
const SHADOW = "shadow"
const OUTBOX = "outbox"
const LOOSE = "loose"
const PLAYS = "plays"
const DESTINATIONS = "destinations"
const SENT_PLAYS = "sent-plays"
const BY_BOOK = "by-book"
const BOOK_STORES = [CHANGES, SHADOW, OUTBOX, LOOSE, PLAYS] as const
const EVERY_STORE = [LINKS, ...BOOK_STORES, DESTINATIONS, SENT_PLAYS] as const

type Stored<T> = T & { readonly bookId: BookId }

const unavailable = (cause: unknown): LineStoreError => ({ type: "unavailable", detail: cause instanceof Error ? cause.message : String(cause) })

const requested = <T>(request: IDBRequest<T>): Promise<Result<T, LineStoreError>> =>
  new Promise((resolve) => {
    request.onsuccess = () => resolve(Ok(request.result))
    request.onerror = () => resolve(Err(unavailable(request.error)))
  })

const completed = (transaction: IDBTransaction): Promise<Result<void, LineStoreError>> =>
  new Promise((resolve) => {
    transaction.oncomplete = () => resolve(Ok(undefined))
    transaction.onerror = () => resolve(Err(unavailable(transaction.error)))
    transaction.onabort = () => resolve(Err(unavailable(transaction.error ?? "aborted")))
  })

const opened = (): Promise<Result<IDBDatabase, LineStoreError>> =>
  new Promise((resolve) => {
    try {
      const request = indexedDB.open(CROSSING_DATABASE, VERSION)
      request.onupgradeneeded = () => {
        const database = request.result
        if (!database.objectStoreNames.contains(LINKS)) database.createObjectStore(LINKS, { keyPath: "bookId" })
        BOOK_STORES.filter((name) => !database.objectStoreNames.contains(name)).forEach((name) => database.createObjectStore(name, { keyPath: ["bookId", "key"] }).createIndex(BY_BOOK, "bookId"))
        if (!database.objectStoreNames.contains(DESTINATIONS)) database.createObjectStore(DESTINATIONS, { keyPath: "invitation" })
        if (!database.objectStoreNames.contains(SENT_PLAYS)) database.createObjectStore(SENT_PLAYS, { keyPath: "playId" })
      }
      request.onsuccess = () => resolve(Ok(request.result))
      request.onerror = () => resolve(Err(unavailable(request.error)))
      request.onblocked = () => resolve(Err(unavailable("blocked")))
    } catch (cause) {
      resolve(Err(unavailable(cause)))
    }
  })

/** What a book's store holds, every record of the book. */
const allOf = async <T>(database: IDBDatabase, store: string, bookId: BookId): Promise<Result<readonly Stored<T>[], LineStoreError>> => {
  try {
    return await requested(database.transaction(store).objectStore(store).index(BY_BOOK).getAll(IDBKeyRange.only(bookId)) as IDBRequest<Stored<T>[]>)
  } catch (cause) {
    return Err(unavailable(cause))
  }
}

const isKeptPlay = (value: unknown): value is KeptPlay =>
  typeof value === "object" && value !== null && ((value as KeptPlay).type === "held" || (value as KeptPlay).type === "followed") && typeof (value as KeptPlay).playId === "string"

/**
 * A link as it was kept: as it is written now, or as 0.10.1 wrote one of the
 * owner's, with its sync secret beside the rest, read as the owner's at the
 * epoch its line began on; none where it is anything else.
 */
const linkOf = (value: unknown): BookLink | undefined => {
  if (typeof value !== "object" || value === null) return undefined
  const link = value as BookLink & { readonly sync?: unknown }
  if (typeof link.bookId !== "string" || typeof link.head !== "string") return undefined
  if (typeof link.access === "object" && link.access !== null) return link
  if (typeof link.sync !== "string") return undefined
  const { sync, ...rest } = link
  return { ...rest, access: { role: "owner", sync }, epochNumber: 0, floor: { type: "joined" } }
}

/** Writes in one transaction, all or none. */
const written = async (database: IDBDatabase, stores: readonly string[], write: (transaction: IDBTransaction) => void): Promise<Result<void, LineStoreError>> => {
  try {
    const transaction = database.transaction([...stores], "readwrite")
    const done = completed(transaction)
    write(transaction)
    return await done
  } catch (cause) {
    return Err(unavailable(cause))
  }
}

/** The files of a book's shadow that are not the given ones: those to put again, and those to take away. */
const shadowWrites = (kept: readonly Stored<{ readonly key: string; readonly text: string }>[], files: BookFiles): { readonly put: readonly [string, string][]; readonly gone: readonly string[] } => {
  const was = new Map(kept.map((record) => [record.key, record.text]))
  return { put: Object.entries(files).filter(([path, text]) => was.get(path) !== text), gone: [...was.keys()].filter((path) => files[path] === undefined) }
}

/** What the device keeps of its lines in IndexedDB, in a database of its own. */
export const createIndexedDbLineStore = (): LineStore => {
  const held: { database: Promise<Result<IDBDatabase, LineStoreError>> | undefined } = { database: undefined }
  const connect = (): Promise<Result<IDBDatabase, LineStoreError>> => {
    held.database ??= opened().then((database) => {
      if (!database.ok) held.database = undefined
      return database
    })
    return held.database
  }
  const withDatabase = async <T>(work: (database: IDBDatabase) => Promise<Result<T, LineStoreError>>): Promise<Result<T, LineStoreError>> => {
    const database = await connect()
    return database.ok ? work(database.value) : database
  }
  const records = <T>(store: string, bookId: BookId): Promise<Result<readonly Stored<T>[], LineStoreError>> => withDatabase((database) => allOf<T>(database, store, bookId))
  const events = async (store: string, bookId: BookId): Promise<Result<readonly NostrEvent[], LineStoreError>> => {
    const found = await records<{ readonly event: NostrEvent }>(store, bookId)
    return found.ok ? Ok(found.value.map((record) => record.event)) : found
  }
  const putEvents = (store: string, bookId: BookId, kept: readonly NostrEvent[]): Promise<Result<void, LineStoreError>> =>
    withDatabase((database) => written(database, [store], (transaction) => kept.forEach((event) => transaction.objectStore(store).put({ bookId, key: event.id, event }))))
  const dropEvents = (store: string, bookId: BookId, ids: readonly string[]): Promise<Result<void, LineStoreError>> =>
    withDatabase((database) => written(database, [store], (transaction) => ids.forEach((id) => transaction.objectStore(store).delete([bookId, id]))))
  const everything = <T>(store: string): Promise<Result<readonly T[], LineStoreError>> =>
    withDatabase(async (database) => {
      try {
        return await requested(database.transaction(store).objectStore(store).getAll() as IDBRequest<T[]>)
      } catch (cause) {
        return Err(unavailable(cause))
      }
    })
  const putOne = (store: string, value: unknown): Promise<Result<void, LineStoreError>> => withDatabase((database) => written(database, [store], (transaction) => transaction.objectStore(store).put(value)))
  const putChanges = (transaction: IDBTransaction, bookId: BookId, changes: readonly HeldChange[]): void =>
    changes.forEach((change) => transaction.objectStore(CHANGES).put({ bookId, key: change.id, ...change }))
  return {
    links: () =>
      withDatabase(async (database) => {
        try {
          const all = await requested(database.transaction(LINKS).objectStore(LINKS).getAll())
          if (!all.ok) return all
          const read = all.value.map(linkOf)
          return read.every((link) => link !== undefined) ? Ok(read as readonly BookLink[]) : Err({ type: "unreadable" })
        } catch (cause) {
          return Err(unavailable(cause))
        }
      }),
    putLink: (link) => withDatabase((database) => written(database, [LINKS], (transaction) => transaction.objectStore(LINKS).put(link))),
    changes: async (bookId) => {
      const found = await records<HeldChange>(CHANGES, bookId)
      return found.ok ? Ok(found.value.map(({ id, change, createdAt }) => ({ id, change, createdAt }))) : found
    },
    shadow: async (bookId) => {
      const found = await records<{ readonly key: string; readonly text: string }>(SHADOW, bookId)
      return found.ok ? Ok(Object.fromEntries(found.value.map((record) => [record.key, record.text]))) : found
    },
    receive: (bookId, changes) => withDatabase((database) => written(database, [CHANGES], (transaction) => putChanges(transaction, bookId, changes))),
    settle: ({ link, changes, shadow }) =>
      withDatabase(async (database) => {
        const kept = await allOf<{ readonly key: string; readonly text: string }>(database, SHADOW, link.bookId)
        if (!kept.ok) return kept
        const writes = shadowWrites(kept.value, shadow)
        return written(database, [LINKS, CHANGES, SHADOW], (transaction) => {
          putChanges(transaction, link.bookId, changes)
          writes.put.forEach(([path, text]) => transaction.objectStore(SHADOW).put({ bookId: link.bookId, key: path, text }))
          writes.gone.forEach((path) => transaction.objectStore(SHADOW).delete([link.bookId, path]))
          transaction.objectStore(LINKS).put(link)
        })
      }),
    outbox: (bookId) => events(OUTBOX, bookId),
    queue: (bookId, queued) => putEvents(OUTBOX, bookId, queued),
    sent: (bookId, ids) => dropEvents(OUTBOX, bookId, ids),
    loose: (bookId) => events(LOOSE, bookId),
    keepLoose: (bookId, kept) => putEvents(LOOSE, bookId, kept),
    dropLoose: (bookId, ids) => dropEvents(LOOSE, bookId, ids),
    plays: () =>
      withDatabase(async (database) => {
        try {
          const all = await requested(database.transaction(PLAYS).objectStore(PLAYS).getAll())
          return all.ok ? Ok(all.value.filter(isKeptPlay).map(({ key: _key, ...play }: KeptPlay & { readonly key?: string }) => play as KeptPlay)) : all
        } catch (cause) {
          return Err(unavailable(cause))
        }
      }),
    putPlay: (play) => withDatabase((database) => written(database, [PLAYS], (transaction) => transaction.objectStore(PLAYS).put({ ...play, key: play.playId }))),
    dropPlay: (bookId, playId) => withDatabase((database) => written(database, [PLAYS], (transaction) => transaction.objectStore(PLAYS).delete([bookId, playId]))),
    forget: (bookId) =>
      withDatabase((database) =>
        written(database, [LINKS, ...BOOK_STORES], (transaction) => {
          transaction.objectStore(LINKS).delete(bookId)
          BOOK_STORES.forEach((store) => transaction.objectStore(store).delete(IDBKeyRange.bound([bookId], [bookId, []])))
        }),
      ),
    destinations: () => everything<Destination>(DESTINATIONS),
    putDestination: (destination) => putOne(DESTINATIONS, destination),
    forgetDestination: (invitation) =>
      withDatabase(async (database) => {
        const sent = await everything<SentPlay>(SENT_PLAYS)
        if (!sent.ok) return sent
        return written(database, [DESTINATIONS, SENT_PLAYS], (transaction) => {
          transaction.objectStore(DESTINATIONS).delete(invitation)
          sent.value.filter((play) => play.invitation === invitation).forEach((play) => transaction.objectStore(SENT_PLAYS).delete(play.playId))
        })
      }),
    sentPlays: () => everything<SentPlay>(SENT_PLAYS),
    putSentPlay: (play) => putOne(SENT_PLAYS, play),
    dropSentPlay: (playId) => withDatabase((database) => written(database, [SENT_PLAYS], (transaction) => transaction.objectStore(SENT_PLAYS).delete(playId))),
  }
}

/** Every line this device keeps, let go of with the rest of the device's data: the database emptied, as the app's own is. */
export const clearCrossingDatabase = async (): Promise<Result<void, LineStoreError>> => {
  const database = await opened()
  if (!database.ok) return database
  return written(database.value, EVERY_STORE, (transaction) => EVERY_STORE.forEach((store) => transaction.objectStore(store).clear()))
}

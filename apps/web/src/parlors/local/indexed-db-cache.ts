import { EMPTY_PARLOR_LIST, type ParlorList } from "../../core/parlor/shared"
import { Err, mapOk, type Result } from "../../core/result/result"
import { type Connection, SHARED_PARLORS, completionOf, resultOf } from "../../storage/browser/database"
import type { StorageError } from "../../storage/port/book-storage"
import type { CacheError, ParlorCache } from "../port/parlor-cache"

const fromStorage = <T>(result: Result<T, StorageError>): Result<T, CacheError> =>
  result.ok ? result : Err({ detail: result.error.type === "unavailable" ? result.error.detail : result.error.type })

/** The one record the list is kept as, whole: replaced each time the list is read. */
const LIST_KEY = "list"

interface ListRecord extends ParlorList {
  readonly id: typeof LIST_KEY
  /** The published list's version this copy was read from; absent from a copy kept before versions were. */
  readonly version?: string
}

/** The parlor list as last read, in IndexedDB. A device that never read one has an empty list. */
export const createIndexedDbParlorCache = (database: Connection): ParlorCache => {
  const read: ParlorCache["read"] = async () => {
    const db = fromStorage(await database())
    if (!db.ok) return db
    return mapOk(fromStorage(await resultOf<ListRecord>(db.value.transaction(SHARED_PARLORS).objectStore(SHARED_PARLORS).get(LIST_KEY))), (found) =>
      found === undefined ? { list: EMPTY_PARLOR_LIST, version: undefined } : { list: { parlors: found.parlors, rejections: found.rejections }, version: found.version },
    )
  }

  const replace: ParlorCache["replace"] = async ({ list, version }) => {
    const db = fromStorage(await database())
    if (!db.ok) return db
    const transaction = db.value.transaction(SHARED_PARLORS, "readwrite")
    transaction.objectStore(SHARED_PARLORS).put({ id: LIST_KEY, parlors: list.parlors, rejections: list.rejections, ...(version === undefined ? {} : { version }) } satisfies ListRecord)
    return mapOk(fromStorage(await completionOf(transaction)), () => undefined)
  }

  return { read, replace }
}

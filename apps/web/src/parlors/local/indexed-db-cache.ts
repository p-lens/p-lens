import { EMPTY_PARLOR_LIST, type ParlorList } from "../../core/parlor/shared"
import { Err, Ok, mapOk, type Result } from "../../core/result/result"
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

type Fields = Readonly<Record<string, unknown>>

const isFields = (value: unknown): value is Fields => typeof value === "object" && value !== null && !Array.isArray(value)

const isTexts = (value: unknown): boolean => Array.isArray(value) && value.every((each) => typeof each === "string")

const isParlor = (value: unknown): boolean =>
  isFields(value) && ["id", "name", "reading", "prefecture", "address"].every((name) => typeof value[name] === "string") && isTexts(value["keywords"]) && isTexts(value["submissions"])

/** Whether the record kept reads as the list it was: a copy that does not is no copy, and the list is read again in its place. */
const isListRecord = (value: unknown): value is ListRecord =>
  isFields(value) &&
  Array.isArray(value["parlors"]) &&
  value["parlors"].every(isParlor) &&
  Array.isArray(value["rejections"]) &&
  value["rejections"].every(isFields) &&
  (value["version"] === undefined || typeof value["version"] === "string")

/** The parlor list as last read, in IndexedDB. A device that never read one has an empty list. */
export const createIndexedDbParlorCache = (database: Connection): ParlorCache => {
  const read: ParlorCache["read"] = async () => {
    const db = fromStorage(await database())
    if (!db.ok) return db
    const found = fromStorage(await resultOf<unknown>(db.value.transaction(SHARED_PARLORS).objectStore(SHARED_PARLORS).get(LIST_KEY)))
    if (!found.ok) return found
    if (found.value === undefined) return Ok({ list: EMPTY_PARLOR_LIST, version: undefined })
    return isListRecord(found.value) ? Ok({ list: { parlors: found.value.parlors, rejections: found.value.rejections }, version: found.value.version }) : Err({ detail: "unreadable" })
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

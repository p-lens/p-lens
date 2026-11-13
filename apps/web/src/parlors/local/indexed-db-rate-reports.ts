import { Err, Ok, mapOk, type Result } from "../../core/result/result"
import { type Connection, SHARED_PARLORS, completionOf, resultOf } from "../../storage/browser/database"
import type { StorageError } from "../../storage/port/book-storage"
import type { CacheError } from "../port/parlor-cache"
import type { KeptFile, KeptReports, RateReportsCache } from "../port/rate-reports-cache"

const fromStorage = <T>(result: Result<T, StorageError>): Result<T, CacheError> =>
  result.ok ? result : Err({ detail: result.error.type === "unavailable" ? result.error.detail : result.error.type })

/** The one record the reports are kept as, beside the parlor list's: replaced each time they are read. */
const REPORTS_KEY = "rate-reports"

interface ReportsRecord extends KeptReports {
  readonly id: typeof REPORTS_KEY
}

type Fields = Readonly<Record<string, unknown>>

const isFields = (value: unknown): value is Fields => typeof value === "object" && value !== null && !Array.isArray(value)

const isKeptFile = (value: unknown): value is KeptFile => isFields(value) && typeof value["text"] === "string" && (value["version"] === undefined || typeof value["version"] === "string")

/** The reports as last read, in IndexedDB beside the parlor list. A record that does not read as them is no copy, and they are read again in its place. */
export const createIndexedDbRateReportsCache = (database: Connection): RateReportsCache => {
  const read: RateReportsCache["read"] = async () => {
    const db = fromStorage(await database())
    if (!db.ok) return db
    const found = fromStorage(await resultOf<unknown>(db.value.transaction(SHARED_PARLORS).objectStore(SHARED_PARLORS).get(REPORTS_KEY)))
    if (!found.ok) return found
    const kept = found.value
    if (kept === undefined) return Ok(undefined)
    return isFields(kept) && isKeptFile(kept["tiers"]) && isKeptFile(kept["observations"]) ? Ok({ tiers: kept["tiers"], observations: kept["observations"] }) : Err({ detail: "unreadable" })
  }

  const replace: RateReportsCache["replace"] = async (kept) => {
    const db = fromStorage(await database())
    if (!db.ok) return db
    const transaction = db.value.transaction(SHARED_PARLORS, "readwrite")
    transaction.objectStore(SHARED_PARLORS).put({ id: REPORTS_KEY, ...kept } satisfies ReportsRecord)
    return mapOk(fromStorage(await completionOf(transaction)), () => undefined)
  }

  return { read, replace }
}

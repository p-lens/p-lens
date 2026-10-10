import { Err, mapOk, type Result } from "../../core/result/result"
import { type Connection, SUBMISSIONS, completionOf, resultOf } from "../../storage/browser/database"
import type { StorageError } from "../../storage/port/book-storage"
import type { Submission, SubmissionStore, SubmissionStoreError } from "../port/submission-store"

const fromStorage = <T>(result: Result<T, StorageError>): Result<T, SubmissionStoreError> =>
  result.ok ? result : Err({ detail: result.error.type === "unavailable" ? result.error.detail : result.error.type })

/** The submissions this device made, in IndexedDB, keyed by their id. */
export const createIndexedDbSubmissions = (database: Connection): SubmissionStore => {
  const list: SubmissionStore["list"] = async () => {
    const db = fromStorage(await database())
    if (!db.ok) return db
    return mapOk(fromStorage(await resultOf<Submission[]>(db.value.transaction(SUBMISSIONS).objectStore(SUBMISSIONS).getAll())), (found) =>
      (found ?? []).toSorted((left, right) => right.submittedAt.localeCompare(left.submittedAt)),
    )
  }

  const keep: SubmissionStore["keep"] = async (submission) => {
    const db = fromStorage(await database())
    if (!db.ok) return db
    const transaction = db.value.transaction(SUBMISSIONS, "readwrite")
    const store = transaction.objectStore(SUBMISSIONS)
    const kept = await resultOf<Submission>(store.get(submission.submission))
    if (kept.ok && kept.value === undefined) store.put(submission)
    return mapOk(fromStorage(await completionOf(transaction)), () => undefined)
  }

  return { list, keep }
}

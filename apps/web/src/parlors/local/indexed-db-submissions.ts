import { Err, Ok, mapOk, type Result } from "../../core/result/result"
import { type Connection, SUBMISSIONS, completionOf, resultOf } from "../../storage/browser/database"
import type { StorageError } from "../../storage/port/book-storage"
import type { Submission, SubmissionStore, SubmissionStoreError } from "../port/submission-store"

const fromStorage = <T>(result: Result<T, StorageError>): Result<T, SubmissionStoreError> =>
  result.ok ? result : Err({ type: "unavailable", detail: result.error.type === "unavailable" ? result.error.detail : result.error.type })

const isSubmission = (value: unknown): value is Submission =>
  typeof value === "object" && value !== null && ["submission", "name", "prefecture", "submittedAt"].every((name) => typeof (value as Readonly<Record<string, unknown>>)[name] === "string")

/** The submissions this device made, in IndexedDB, keyed by their id; one kept that does not read as one is told as such, never sorted past. */
export const createIndexedDbSubmissions = (database: Connection): SubmissionStore => {
  const list: SubmissionStore["list"] = async () => {
    const db = fromStorage(await database())
    if (!db.ok) return db
    const found = fromStorage(await resultOf<unknown[]>(db.value.transaction(SUBMISSIONS).objectStore(SUBMISSIONS).getAll()))
    if (!found.ok) return found
    const kept = found.value ?? []
    return kept.every(isSubmission) ? Ok(kept.toSorted((left, right) => right.submittedAt.localeCompare(left.submittedAt))) : Err({ type: "unreadable" })
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

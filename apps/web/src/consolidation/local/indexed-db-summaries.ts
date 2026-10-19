import { CONSOLIDATION_ANSWERS, CONSOLIDATION_ANSWERS_BY_KEPT, type Connection, completionOf, resultOf } from "../../storage/browser/database"
import type { Summaries } from "../port/summaries"

/** How many answers are kept on the device: every consolidation question about a few dozen books, over many days. */
const KEPT_AT_MOST = 5000

interface AnswerRecord {
  readonly key: string
  /** The build that kept it: an answer is read back only by the build whose shapes it has. */
  readonly shape: string
  /** When it was kept, in milliseconds, so that the oldest go first. */
  readonly kept: number
  readonly answer: unknown
}

const isAnswerRecord = (value: unknown): value is AnswerRecord => typeof value === "object" && value !== null && typeof (value as Partial<AnswerRecord>).shape === "string" && "answer" in value

/** Let go of the oldest answers past `KEPT_AT_MOST`, inside the transaction that kept the newest. */
const trimmed = (store: IDBObjectStore): void => {
  const counted = store.count()
  counted.onsuccess = () => {
    const over = { left: counted.result - KEPT_AT_MOST }
    if (over.left <= 0) return
    const cursor = store.index(CONSOLIDATION_ANSWERS_BY_KEPT).openCursor()
    cursor.onsuccess = () => {
      const at = cursor.result
      if (at === null || over.left <= 0) return
      at.delete()
      over.left -= 1
      at.continue()
    }
  }
}

/**
 * A consolidation's answers kept in IndexedDB, so that a page opened again
 * finds what the books it shows were answered before, while they stand as
 * they stood. A store that cannot be reached keeps nothing and finds
 * nothing: every answer is then asked of hledger, as without it.
 */
export const createIndexedDbSummaries = (database: Connection, shape: string): Summaries => ({
  kept: async (key) => {
    const db = await database()
    if (!db.ok) return undefined
    const found = await resultOf<unknown>(db.value.transaction(CONSOLIDATION_ANSWERS).objectStore(CONSOLIDATION_ANSWERS).get(key))
    return found.ok && isAnswerRecord(found.value) && found.value.shape === shape ? found.value.answer : undefined
  },
  keep: async (key, answer) => {
    const db = await database()
    if (!db.ok) return
    const transaction = db.value.transaction(CONSOLIDATION_ANSWERS, "readwrite")
    const store = transaction.objectStore(CONSOLIDATION_ANSWERS)
    store.put({ key, shape, kept: Date.now(), answer } satisfies AnswerRecord)
    trimmed(store)
    await completionOf(transaction)
  },
})

import type { Summaries } from "../port/summaries"

/** How many answers are kept in memory: every consolidation question about a few dozen books, a few times over. */
const KEPT_AT_MOST = 2000

/**
 * A consolidation's answers kept in this page's memory, the oldest let go
 * of past `KEPT_AT_MOST`: gone when the page is.
 */
export const createMemorySummaries = (): Summaries => {
  const answers = new Map<string, unknown>()
  return {
    kept: async (key) => answers.get(key),
    keep: async (key, answer) => {
      answers.delete(key)
      answers.set(key, answer)
      for (const oldest of answers.keys()) {
        if (answers.size <= KEPT_AT_MOST) return
        answers.delete(oldest)
      }
    },
  }
}

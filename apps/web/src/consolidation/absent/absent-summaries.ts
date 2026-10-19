import type { Summaries } from "../port/summaries"

/** Nothing kept: every book is asked of hledger every time, as before anything was. What a deployment cuts keeping off with. */
export const createAbsentSummaries = (): Summaries => ({
  kept: async () => undefined,
  keep: async () => undefined,
})

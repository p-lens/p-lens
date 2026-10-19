import type { Summaries } from "../port/summaries"

/**
 * Answers looked for near first and far only when near has none, and kept in
 * both: memory in front of the device's store, so that an answer read once is
 * read again without going to the store.
 */
export const createTieredSummaries = (near: Summaries, far: Summaries): Summaries => ({
  kept: async (key) => {
    const close = await near.kept(key)
    if (close !== undefined) return close
    const distant = await far.kept(key)
    if (distant !== undefined) await near.keep(key, distant)
    return distant
  },
  keep: async (key, answer) => {
    await near.keep(key, answer)
    await far.keep(key, answer)
  },
})

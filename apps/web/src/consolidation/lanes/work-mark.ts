import type { StoppedAtWork } from "../port/lanes"

/** Where a page reading on several hledgers marks that it is, so that the next page finds the mark where it stopped: kept under the device's own prefix, so clearing the device clears it. */
const AT_WORK = "p-lens.consolidation-at-work"

/** The device's storage, where it lets a page reach it. */
const storageOf = (): Storage | undefined => {
  try {
    return globalThis.localStorage
  } catch {
    return undefined
  }
}

const quietly = (work: (storage: Storage) => void): void => {
  try {
    const storage = storageOf()
    if (storage !== undefined) work(storage)
  } catch {
    return
  }
}

/**
 * A mark kept on the device while the page reads on several hledgers, and
 * what the mark said when the page opened. The mark is set as such reading
 * begins and taken away as the last of it ends and as the page is put out
 * of sight, where a phone may end it with no word: a page that finds the
 * mark stopped in the middle of it, and the mark is taken away once that is
 * told.
 */
export const createWorkMark = (): StoppedAtWork & { readonly working: (busy: boolean) => void } => {
  const held: { stopped: boolean; busy: number } = { stopped: false, busy: 0 }
  quietly((storage) => {
    held.stopped = storage.getItem(AT_WORK) !== null
  })
  const visible = (): boolean => globalThis.document?.visibilityState !== "hidden"
  const mark = (): void => quietly((storage) => (held.busy > 0 && visible() ? storage.setItem(AT_WORK, String(Math.floor(Date.now() / 1000))) : storage.removeItem(AT_WORK)))
  globalThis.document?.addEventListener("visibilitychange", mark)
  return {
    stopped: () => held.stopped,
    told: () => quietly((storage) => storage.removeItem(AT_WORK)),
    working: (busy) => {
      held.busy = Math.max(0, held.busy + (busy ? 1 : -1))
      mark()
    },
  }
}

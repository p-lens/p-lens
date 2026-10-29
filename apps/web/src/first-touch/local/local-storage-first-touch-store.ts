import { seenFrom, type FirstTouchNote } from "../core/notes"
import type { FirstTouchStore } from "../port/first-touch-store"

const SEEN = "p-lens.first-touch-seen"

/** What is kept, read as JSON; nothing, or nothing that parses, is nothing seen. */
const kept = (): unknown => {
  try {
    return JSON.parse(localStorage.getItem(SEEN) ?? "[]")
  } catch {
    return []
  }
}

/** localStorage may be absent or refuse; neither stops the notes, which then go by what the page holds. */
const keep = (seen: ReadonlySet<FirstTouchNote>): void => {
  try {
    if (seen.size === 0) localStorage.removeItem(SEEN)
    else localStorage.setItem(SEEN, JSON.stringify([...seen]))
  } catch {
    return
  }
}

/** The notes a device has shown, kept in localStorage under a `p-lens.` key, so that emptying the device takes them too. */
export const createLocalStorageFirstTouchStore = (): FirstTouchStore => {
  const held: { seen: ReadonlySet<FirstTouchNote> } = { seen: seenFrom(kept()) }
  const put = (seen: ReadonlySet<FirstTouchNote>): void => {
    held.seen = seen
    keep(seen)
  }
  return {
    seen: (note) => held.seen.has(note),
    see: (note) => put(new Set([...held.seen, note])),
    forget: () => put(new Set()),
  }
}

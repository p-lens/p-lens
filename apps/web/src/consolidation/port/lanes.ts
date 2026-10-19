/**
 * The hledgers a consolidation reads its books on side by side: the one
 * every screen reads on, and others beside it only where a device has many
 * books to consolidate, so that a person with few is never made to carry
 * more than one. Books are dealt out among them, each read on the same one
 * every time while the books stand as they do, and each hledger reads its
 * books in turn.
 */
export interface Lanes<Session> {
  /** The sessions to read so many books on, the one every screen reads on first. */
  readonly sessionsFor: (books: number) => readonly Session[]
  /** Told as reading on more than one begins and as it ends: what a device that stops meanwhile was doing. */
  readonly working: (busy: boolean) => void
}

/**
 * Whether the page before this one stopped while reading on several
 * hledgers — most likely out of memory — and the word of it, once told.
 * A page that finds it so reads on one hledger alone, and it is said once.
 */
export interface StoppedAtWork {
  readonly stopped: () => boolean
  /** The word was told: it is not told again, though this page still reads on one. */
  readonly told: () => void
}

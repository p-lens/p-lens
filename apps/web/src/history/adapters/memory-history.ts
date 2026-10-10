import type { BookId } from "../../core/book/book"
import { Ok } from "../../core/result/result"
import type { Commit, CommitId, HistoryPort } from "../port/history-port"

/** A commit as it is held: whether it is on its book's line yet. */
interface Held {
  readonly commit: Commit
  readonly onLine: boolean
}

/**
 * History held in memory and gone with it: what a test keeps a book's
 * commits in, where the app keeps them in IndexedDB.
 */
export const createMemoryHistory = (nextId: () => string): HistoryPort => {
  const kept: { oldestFirst: readonly Held[] } = { oldestFirst: [] }
  const of = (book: BookId): readonly Held[] => kept.oldestFirst.filter((held) => held.commit.change.bookId === book)
  const others = (book: BookId): readonly Held[] => kept.oldestFirst.filter((held) => held.commit.change.bookId !== book)
  return {
    commit: async (change) => {
      const id = nextId() as CommitId
      kept.oldestFirst = [...kept.oldestFirst, { commit: { id, change }, onLine: false }]
      return Ok(id)
    },
    forget: async (book) => {
      kept.oldestFirst = others(book)
      return Ok(undefined)
    },
    log: async (book) => Ok(of(book).map((held) => held.commit).toReversed()),
    unsent: async (book) => Ok(of(book).filter((held) => !held.onLine).map((held) => held.commit)),
    reconcile: async (book, received, rebased) => {
      kept.oldestFirst = [
        ...others(book),
        ...of(book).filter((held) => held.onLine),
        ...received.map((commit) => ({ commit, onLine: true })),
        ...rebased.map((commit) => ({ commit, onLine: false })),
      ]
      return Ok(undefined)
    },
    unsend: async (book) => {
      kept.oldestFirst = kept.oldestFirst.map((held) => (held.commit.change.bookId === book ? { ...held, onLine: false } : held))
      return Ok(undefined)
    },
    sent: async (book, ids) => {
      kept.oldestFirst = kept.oldestFirst.map((held) => (held.commit.change.bookId === book && ids.includes(held.commit.id) ? { ...held, onLine: true } : held))
      return Ok(undefined)
    },
  }
}

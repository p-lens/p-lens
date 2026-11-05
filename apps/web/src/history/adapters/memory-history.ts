import type { BookId } from "../../core/book/book"
import { Ok } from "../../core/result/result"
import type { Commit, CommitId, HistoryPort } from "../port/history-port"

/**
 * History held in memory and gone with it: what a test keeps a book's
 * commits in, where the app keeps them in IndexedDB.
 */
export const createMemoryHistory = (nextId: () => string): HistoryPort => {
  const kept: { oldestFirst: readonly Commit[] } = { oldestFirst: [] }
  const of = (book: BookId): readonly Commit[] => kept.oldestFirst.filter((commit) => commit.change.bookId === book)
  const others = (book: BookId): readonly Commit[] => kept.oldestFirst.filter((commit) => commit.change.bookId !== book)
  return {
    commit: async (change) => {
      const id = nextId() as CommitId
      kept.oldestFirst = [...kept.oldestFirst, { id, change }]
      return Ok(id)
    },
    forget: async (book) => {
      kept.oldestFirst = others(book)
      return Ok(undefined)
    },
    log: async (book) => Ok(of(book).toReversed()),
  }
}

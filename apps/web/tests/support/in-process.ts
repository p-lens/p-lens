import { readFile } from "node:fs/promises"

import type { Book, BookId, MemberId } from "../../src/core/book/book"
import { isTransactionsFile } from "../../src/core/journal/filing"
import { BOOK_FILES, type BookFiles } from "../../src/core/journal/layout"
import { Err, Ok } from "../../src/core/result/result"
import type { HledgerClient, JournalAccess } from "../../src/hledger/client/client"
import { startEngine } from "../../src/hledger/worker/engine"
import type { PlayDraft } from "../../src/core/live-play/draft"
import type { PlayId } from "../../src/core/play/play"
import type { BookStorage, StoredBook } from "../../src/storage/port/book-storage"
import type { DraftStorage } from "../../src/storage/port/draft-storage"

const WEB = new URL("../../", import.meta.url).pathname

/** The real hledger module, run in this process rather than in a worker. */
export const inProcessHledger = async (): Promise<HledgerClient> => {
  const engine = await startEngine(await WebAssembly.compile(await readFile(`${WEB}public/hledger.wasm`)))
  const access: JournalAccess = {
    open: async (files, entry) => {
      const reply = await engine.open(files, entry)
      return reply.ok ? Ok(reply.value as never) : Err(reply.trouble)
    },
    ask: async (request) => {
      const reply = await engine.query(request)
      return reply.ok ? Ok(reply.value as never) : Err(reply.trouble)
    },
  }
  const turns: { last: Promise<unknown> } = { last: Promise.resolve() }
  return {
    inTurn: (work) => {
      const mine = turns.last.then(() => work(access))
      turns.last = mine.catch(() => undefined)
      return mine
    },
  }
}

/** Storage that keeps books in a map, with the same refusals as the browser's. */
export const memoryStorage = (): BookStorage & { readonly peek: (id: BookId) => StoredBook | undefined } => {
  const books = new Map<BookId, StoredBook>()
  return {
    peek: (id) => books.get(id),
    listBooks: async () => Ok([...books.values()].map((stored) => stored.book)),
    readBook: async (id) => {
      const stored = books.get(id)
      return stored === undefined ? Err({ type: "book-missing", bookId: id }) : Ok(stored)
    },
    createBook: async (stored) => {
      if (books.has(stored.book.id)) return Err({ type: "book-exists", bookId: stored.book.id })
      books.set(stored.book.id, stored)
      return Ok(undefined)
    },
    deleteBook: async (id) => {
      books.delete(id)
      return Ok(undefined)
    },
    applyChanges: async (id, changes) => {
      const stored = books.get(id)
      if (stored === undefined) return Err({ type: "book-missing", bookId: id })
      const stale = changes.find((change) => stored.files[change.path] !== change.before)
      if (stale !== undefined) return Err({ type: "changed-elsewhere", path: stale.path })
      books.set(id, { ...stored, files: { ...stored.files, ...Object.fromEntries(changes.map((change) => [change.path, change.after])) } })
      return Ok(undefined)
    },
  }
}

export const ME = "me" as MemberId

export const fixtureBook = async (name: string, book: Book): Promise<StoredBook> => {
  const paths = Object.values(BOOK_FILES)
  const texts = await Promise.all(paths.map((path) => readFile(`${WEB}fixtures/${name}/${path}`, "utf8")))
  return { book, files: Object.fromEntries(paths.map((path, index) => [path, texts[index] ?? ""])) }
}

export const readExpected = async (name: string): Promise<unknown> =>
  JSON.parse(await readFile(`${WEB}fixtures/${name}/expected.json`, "utf8"))

/** Drafts kept in a map, with the same refusals as the browser's. */
export const memoryDrafts = (): DraftStorage => {
  const drafts = new Map<PlayId, PlayDraft>()
  return {
    listDrafts: async () => Ok([...drafts.values()]),
    readDraft: async (id) => {
      const draft = drafts.get(id)
      return draft === undefined ? Err({ type: "draft-missing", playId: id }) : Ok(draft)
    },
    createDraft: async (draft) => {
      drafts.set(draft.id, draft)
      return Ok(undefined)
    },
    updateDraft: async (draft, previousLog) => {
      const current = drafts.get(draft.id)
      if (current === undefined) return Err({ type: "draft-missing", playId: draft.id })
      if (current.log !== previousLog) return Err({ type: "changed-elsewhere", path: draft.id })
      drafts.set(draft.id, draft)
      return Ok(undefined)
    },
    deleteDraft: async (id) => {
      drafts.delete(id)
      return Ok(undefined)
    },
  }
}

/** Every file of a book's transactions as one text, the years in order and those not filed by year after them: where a test looks for an entry written, whichever file it went to. */
export const transactionsOf = (files: BookFiles | undefined): string =>
  Object.keys(files ?? {})
    .filter(isTransactionsFile)
    .toSorted((left, right) => Number(left === BOOK_FILES.transactions) - Number(right === BOOK_FILES.transactions) || left.localeCompare(right))
    .map((path) => files?.[path] ?? "")
    .join("\n")

import { describe, expect, test } from "bun:test"

import { firstBook } from "../../src/app/composition/first-book"
import { loadWelcomeDue } from "../../src/application/onboarding/welcome"
import type { BookSession } from "../../src/application/book-session"
import type { BookId, MemberId } from "../../src/core/book/book"
import { welcomeDue } from "../../src/core/onboarding/welcome"
import type { WelcomeStore } from "../../src/onboarding/port/welcome-store"
import type { StoredBook } from "../../src/storage/port/book-storage"
import type { DraftStorage } from "../../src/storage/port/draft-storage"

/** A device first opened long after the welcome came to be, and one long before it. */
const NEW = 9_999_999_999
const OLD = 0

const ME = "me" as MemberId

/** The first book a device is given as it first opens, and another drawn as fresh to weigh it against: the two differ in id and title alone. */
const FIRST = firstBook("first" as BookId, ME, "🍀マイ帳簿")
const FRESH = firstBook("fresh" as BookId, ME, "🌙マイ帳簿")

const WRITTEN = firstBook("written" as BookId, ME, "🌸マイ帳簿")

const touched: StoredBook = { ...WRITTEN, files: Object.fromEntries(Object.entries(WRITTEN.files).map(([path, text]) => [path, path.endsWith(".journal") ? `${text}\n2026-10-20 * 手で書いた\n    資産:現金  -1000 JPY\n    費用:雑費\n` : text])) }

const store = (firstOpened: number, welcomed: boolean): WelcomeStore => ({ firstOpened: () => firstOpened, welcomed: () => welcomed, setWelcomed: () => undefined })

const session = (books: readonly StoredBook[]): BookSession =>
  ({
    books: async () => ({ ok: true, value: books.map((book) => book.book) }),
    stored: async (bookId: BookId) => ({ ok: true, value: books.find((book) => book.book.id === bookId) }),
  }) as never

const drafts = (plays: number): DraftStorage => ({ listDrafts: async () => ({ ok: true, value: Array.from({ length: plays }) }) }) as never

describe("the welcome", () => {
  test("greets a new device that holds nothing, once", () => {
    expect(welcomeDue({ firstOpened: NEW, welcomed: false, holdsAnything: false })).toBe(true)
    expect(welcomeDue({ firstOpened: NEW, welcomed: true, holdsAnything: false })).toBe(false)
  })

  test("leaves alone a device opened before it came to be, and one that holds something", () => {
    expect(welcomeDue({ firstOpened: OLD, welcomed: false, holdsAnything: false })).toBe(false)
    expect(welcomeDue({ firstOpened: NEW, welcomed: false, holdsAnything: true })).toBe(false)
  })

  test("takes the first book every device is given, untouched, for nothing", async () => {
    expect(await loadWelcomeDue(session([FIRST]), drafts(0), store(NEW, false), FRESH)).toBe(true)
  })

  test("takes a book written in, or a play, for something", async () => {
    expect(await loadWelcomeDue(session([touched]), drafts(0), store(NEW, false), FRESH)).toBe(false)
    expect(await loadWelcomeDue(session([FIRST, touched]), drafts(0), store(NEW, false), FRESH)).toBe(false)
    expect(await loadWelcomeDue(session([FIRST]), drafts(1), store(NEW, false), FRESH)).toBe(false)
  })

  test("is not due where what the device holds cannot be read", async () => {
    const unread = { books: async () => ({ ok: false, error: { type: "storage" } }) } as never
    expect(await loadWelcomeDue(unread, drafts(0), store(NEW, false), FRESH)).toBe(false)
  })
})

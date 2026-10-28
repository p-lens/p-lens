import { describe, expect, test } from "bun:test"

import { firstBook } from "../../src/app/composition/first-book"
import { loadActivity } from "../../src/application/activity"
import { loadMarks, pressMark, type VoterOf } from "../../src/application/marks"
import type { Catalog } from "../../src/catalog/port/catalog"
import { MARKS_LOG, type MarkDeed, type MarkLine } from "../../src/core/marks/marks"
import { deleteBook, holdsNothing } from "../../src/application/delete-book"
import { createBookSession } from "../../src/application/book-session"
import { loadOverview } from "../../src/application/overview"
import { recordYenTally } from "../../src/application/record-tally"
import { renameBook } from "../../src/application/rename-book"
import { ensureFirstBook } from "../../src/application/seed"
import type { BookId } from "../../src/core/book/book"
import type { IsoDate } from "../../src/core/calendar/calendar"
import { toPlainString } from "../../src/core/decimal/decimal"
import { BOOK_FILES } from "../../src/core/journal/layout"
import { readTitle, withTitle } from "../../src/core/journal/title"
import type { PlayDraft } from "../../src/core/live-play/draft"
import { Err, Ok } from "../../src/core/result/result"
import type { DraftStorage } from "../../src/storage/port/draft-storage"
import type { YenTally } from "../../src/core/tally/tally"
import type { PlayId } from "../../src/core/play/play"
import { createMemoryHistory } from "../../src/history/adapters/memory-history"
import { memoryReceipts } from "../support/backup"
import { ACTIVITY_LOG, activityOfText } from "../../src/core/activity/activity"
import { received, type Changing } from "../../src/core/sync/rebase"
import { ME, inProcessHledger, memoryStorage } from "../support/in-process"
import { memoryLinks } from "../support/sync"
import { B, memoryFollow, playAt } from "../support/play-line"
import { dec, saidIn } from "../support/values"

const setUp = async () => {
  const storage = memoryStorage()
  const history = createMemoryHistory(() => crypto.randomUUID())
  const session = createBookSession({
    hledger: await inProcessHledger(),
    storage,
    history,
    clock: () => new Date("2026-10-08T20:00:00+09:00"),
    newId: () => crypto.randomUUID(), member: ME,
  })
  return { storage, history, session }
}

const make = (id: string) => () => firstBook(id as BookId, ME, "🐢マイ帳簿")

const WON: YenTally = { id: "first" as PlayId, parlor: undefined, date: "2026-10-08" as IsoDate, gameKind: "pachinko", machine: "森物語", cabinetNumber: undefined, outlay: dec("2000"), takings: dec("5000"), settlement: undefined, theoreticalValue: dec("1200") , told: undefined}

describe("the book a first visit opens onto", () => {
  test("is put on a device that has none, named and empty, and hledger reads it", async () => {
    const { session } = await setUp()
    const made = await ensureFirstBook(session, make("mine"))
    expect(made).toEqual({ ok: true, value: "mine" as BookId })
    const books = await session.books()
    expect(books.ok && books.value.map((book) => [book.id, book.title])).toEqual([["mine", "🐢マイ帳簿"]] as never)
    const overview = await loadOverview(session, "mine" as BookId, "")
    expect(overview.ok && toPlainString(overview.value.actual)).toBe("0")
  })

  test("is not made where the device already has a book", async () => {
    const { session } = await setUp()
    await ensureFirstBook(session, make("mine"))
    expect(await ensureFirstBook(session, make("another"))).toEqual({ ok: true, value: "mine" as BookId })
    const books = await session.books()
    expect(books.ok && books.value.length).toBe(1)
  })

  test("takes a play like any book", async () => {
    const { session } = await setUp()
    await ensureFirstBook(session, make("mine"))
    expect((await recordYenTally(session, "mine" as BookId, WON, "")).ok).toBe(true)
    const overview = await loadOverview(session, "mine" as BookId, "")
    expect(overview.ok && [toPlainString(overview.value.actual), toPlainString(overview.value.theoretical)]).toEqual(["3000", "1200"])
  })
})

describe("naming a book", () => {
  test("rewrites the title its main journal opens with, as one change in its history", async () => {
    const { session, storage, history } = await setUp()
    await ensureFirstBook(session, make("mine"))
    expect((await renameBook(session, "mine" as BookId, "勝負帳")).ok).toBe(true)
    const books = await session.books()
    expect(books.ok && books.value[0]?.title).toBe("勝負帳")
    const stored = await storage.readBook("mine" as BookId)
    expect(stored.ok && stored.value.files[BOOK_FILES.main]).toContain("; book-title-p: 勝負帳\n")
    expect(stored.ok && stored.value.files[BOOK_FILES.main]).not.toContain("マイ帳簿")
    const activity = await loadActivity(session, history, "mine" as BookId)
    expect(activity.ok && activity.value.lines.map((line) => [line.did, saidIn(line.parts)])).toContainEqual(["book-renamed", { book: { title: "勝負帳" } }])
  })

  test("is written in an activity that makes the book again: its lines in order from nothing leave every file but the log", async () => {
    const { session, storage } = await setUp()
    await ensureFirstBook(session, make("mine"))
    await renameBook(session, "mine" as BookId, "勝負帳")
    const { [ACTIVITY_LOG]: log, ...files } = storage.peek("mine" as BookId)?.files ?? {}
    const lines = activityOfText(log ?? "")
    expect(lines.map((line) => line.did)).toEqual(["book-created", "book-renamed"])
    expect(received({}, lines.map((line) => ({ change: { files: line.parts.changes?.files ?? [] } }) as Changing))).toEqual({ ok: true, value: files })
  })

  test("writes a title where the journal opens with none, and leaves the rest as it is", () => {
    expect(withTitle("include accounts.journal\n", "勝負帳")).toBe("; book-title-p: 勝負帳\ninclude accounts.journal\n")
    expect(withTitle("; a book\n; book-title-p: 旧\n\ninclude a.journal\n; book-title-p: 本文\n", " 新 ")).toBe("; a book\n; book-title-p: 新\n\ninclude a.journal\n; book-title-p: 本文\n")
  })

  test("reads a title tidied, or says what is wrong with it", () => {
    expect(readTitle("  勝負帳 ")).toEqual({ ok: true, value: "勝負帳" })
    expect(readTitle("   ")).toEqual({ ok: false, error: { type: "empty" } })
    expect(readTitle("あ".repeat(31))).toEqual({ ok: false, error: { type: "too-long", longest: 30 } })
    expect(readTitle("一行目\n二行目")).toEqual({ ok: false, error: { type: "unwritable" } })
  })
})

describe("taking a book off the device", () => {
  const ports = async () => {
    const { storage, history, session } = await setUp()
    const links = memoryLinks()
    const receipts = memoryReceipts()
    const kept: { drafts: readonly PlayDraft[] } = { drafts: [] }
    const drafts: DraftStorage = {
      listDrafts: async () => Ok(kept.drafts),
      readDraft: async (id) => {
        const found = kept.drafts.find((draft) => draft.id === id)
        return found === undefined ? Err({ type: "draft-missing", playId: id }) : Ok(found)
      },
      createDraft: async (draft) => {
        kept.drafts = [...kept.drafts, draft]
        return Ok(undefined)
      },
      updateDraft: async () => Ok(undefined),
      deleteDraft: async (id) => {
        kept.drafts = kept.drafts.filter((draft) => draft.id !== id)
        return Ok(undefined)
      },
    }
    return { session, history, storage, links, receipts, drafts, follow: memoryFollow(), kept }
  }

  const draftFor = (id: string, bookId: string): PlayDraft => ({
    id: id as PlayId,
    bookId: bookId as BookId,
    date: "2026-10-08" as IsoDate,
    venue: { type: "none", terms: undefined },
    gameKind: "pachinko",
    machine: "森物語",
    pachinko: undefined,
    cabinetNumber: undefined,
    startedAt: "2026-10-08T11:00:00.000Z",
    log: "",
  })

  test("lets go of its files, its history, its sync link, its receipt, the plays being played for it and the copies of those played elsewhere, and of nothing else", async () => {
    const here = await ports()
    await ensureFirstBook(here.session, make("mine"))
    await here.session.createBook(firstBook("other" as BookId, ME, "マイ帳簿"))
    await here.links.write({ bookId: "mine" as BookId, relayUrl: "https://relay.test", secret: "s", cursor: 0 } as never)
    await here.receipts.write({ bookId: "mine" as BookId, destination: "file", at: "2026-10-08T10:00:00.000Z", fingerprint: "f" })
    await here.receipts.write({ bookId: "other" as BookId, destination: "file", at: "2026-10-08T10:00:00.000Z", fingerprint: "f" })
    await here.drafts.createDraft(draftFor("playing", "mine"))
    await here.drafts.createDraft(draftFor("elsewhere", "other"))
    const copyOn = (id: string, bookId: string) => ({ id: id as PlayId, play: { ...playAt(1, bookId as BookId), id: id as PlayId }, holder: B, shownAt: "2026-10-08T11:30:00.000Z", line: { bookId: bookId as BookId, day: "2026-10-08" as IsoDate } })
    await here.follow.putFollowed(copyOn("watched", "mine"))
    await here.follow.putFollowed(copyOn("watched-elsewhere", "other"))

    expect(await deleteBook(here, "mine" as BookId)).toEqual({ ok: true, value: undefined })

    const books = await here.session.books()
    expect(books.ok && books.value.map((book) => book.id)).toEqual(["other"] as never)
    expect(await here.history.log("mine" as BookId)).toEqual({ ok: true, value: [] })
    const others = await here.history.log("other" as BookId)
    expect(others.ok && others.value.length).toBe(1)
    expect(await here.links.read("mine" as BookId)).toEqual({ ok: true, value: undefined })
    const receipts = await here.receipts.list()
    expect(receipts.ok && receipts.value.map((receipt) => receipt.bookId)).toEqual(["other"] as never)
    expect(here.kept.drafts.map((draft) => draft.id)).toEqual(["elsewhere"] as never)
    expect(here.follow.kept().map((copy) => copy.id)).toEqual(["watched-elsewhere"] as never)
  })

  test("leaves the device a book to keep: the last one deleted, an empty one takes its place", async () => {
    const here = await ports()
    await ensureFirstBook(here.session, make("mine"))
    await deleteBook(here, "mine" as BookId)
    expect(await ensureFirstBook(here.session, make("fresh"))).toEqual({ ok: true, value: "fresh" as BookId })
    const books = await here.session.books()
    expect(books.ok && books.value.map((book) => [book.id, book.title])).toEqual([["fresh", "🐢マイ帳簿"]] as never)
  })

  test("holds nothing while it is as it was made, whatever it is called since — and something once a play is recorded in it", async () => {
    const here = await ports()
    const fresh = firstBook("another" as BookId, ME, "🦎マイ帳簿")
    await ensureFirstBook(here.session, make("mine"))
    expect(await holdsNothing(here, "mine" as BookId, fresh)).toEqual({ ok: true, value: true })
    await renameBook(here.session, "mine" as BookId, "ノリ打ち")
    expect(await holdsNothing(here, "mine" as BookId, fresh)).toEqual({ ok: true, value: true })
    await recordYenTally(here.session, "mine" as BookId, WON)
    expect(await holdsNothing(here, "mine" as BookId, fresh)).toEqual({ ok: true, value: false })
  })

  test("holds something while a play is being played for it", async () => {
    const here = await ports()
    const fresh = firstBook("another" as BookId, ME, "🦎マイ帳簿")
    await ensureFirstBook(here.session, make("mine"))
    await here.drafts.createDraft(draftFor("playing", "mine"))
    expect(await holdsNothing(here, "mine" as BookId, fresh)).toEqual({ ok: true, value: false })
  })
})

describe("a mark pressed in a book", () => {
  /** A catalog that only takes marks, keeping what it was told; it refuses a check of what has no basis. */
  const takingMarks = (): { readonly catalog: Catalog; readonly told: string[] } => {
    const told: string[] = []
    const unused = async (): Promise<never> => {
      throw new Error("not used here")
    }
    return {
      told,
      catalog: {
        search: unused,
        read: unused,
        register: unused,
        addFormula: unused,
        addDistribution: unused,
        quota: unused,
        recordUse: unused,
        refresh: unused,
        mark: async (target, mark, on, voter) => {
          if (target.id === "typed" && mark === "verification") return Err({ type: "not-verifiable" })
          told.push(`${voter} ${on ? "sets" : "clears"} ${mark} on ${target.id}`)
          return Ok(undefined)
        },
      },
    }
  }
  const voterOf: VoterOf = async (bookId, member) => `voter-of-${bookId}-${member}`
  const line = (id: string, did: MarkDeed, formula: string): MarkLine => ({ id, at: `2026-10-10T10:00:0${id}.000Z`, by: ME, did, target: { type: "formula", id: formula }, machineId: "mori" })

  test("is told to the catalog as the book's voter and written in the book, where its member holds it and its activity says nothing", async () => {
    const { session, history } = await setUp()
    await ensureFirstBook(session, make("mine"))
    const { catalog, told } = takingMarks()
    expect((await pressMark(session, catalog, voterOf, "mine" as BookId, line("1", "adoption-given", "basis"))).ok).toBe(true)
    expect((await pressMark(session, catalog, voterOf, "mine" as BookId, line("2", "verification-given", "basis"))).ok).toBe(true)
    expect((await pressMark(session, catalog, voterOf, "mine" as BookId, line("3", "adoption-taken-back", "basis"))).ok).toBe(true)
    expect(told).toEqual(["voter-of-mine-me sets adoption on basis", "voter-of-mine-me sets verification on basis", "voter-of-mine-me clears adoption on basis"])
    const held = await loadMarks(session, "mine" as BookId, ME)
    expect(held.ok && held.value.get("basis")).toEqual({ adopted: false, rejected: false, verified: true, refuted: false })
    const activity = await loadActivity(session, history, "mine" as BookId)
    expect(activity.ok && activity.value.lines.map((each) => each.did)).toEqual(["book-created"])
  })

  test("is not written where the catalog refuses it", async () => {
    const { session, storage } = await setUp()
    await ensureFirstBook(session, make("mine"))
    const { catalog } = takingMarks()
    expect(await pressMark(session, catalog, voterOf, "mine" as BookId, line("1", "verification-given", "typed"))).toEqual({ ok: false, error: { type: "catalog", error: { type: "not-verifiable" } } })
    expect(storage.peek("mine" as BookId)?.files[MARKS_LOG]).toBeUndefined()
  })
})

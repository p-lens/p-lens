import { describe, expect, test } from "bun:test"

import { createBookSession } from "../../src/application/book-session"
import {
  consolidationPorts, oneLane,
  createOutdatedNotice,
  loadConsolidatedDaysAndWhole,
  loadConsolidatedHoldings,
  loadConsolidatedOtherGains,
  loadConsolidatedOverall,
  loadConsolidatedSpinPerformances,
  loadConsolidation,
  type ConsolidatedBook,
  type ConsolidationPorts,
} from "../../src/application/consolidation"
import type { Outcome } from "../../src/application/errors"
import type { BookId } from "../../src/core/book/book"
import type { IsoDate } from "../../src/core/calendar/calendar"
import { withEntriesFiled } from "../../src/core/journal/filing"
import { BOOK_FILES, type BookFiles } from "../../src/core/journal/layout"
import { daysOfQuery, viewOf } from "../../src/core/journal/views"
import { loadBreakdown, loadDaysAndWhole, loadSpinPerformances } from "../../src/application/breakdown"
import { loadHoldings, loadLastMoved } from "../../src/application/holdings"
import { loadOtherGains } from "../../src/application/other-gains"
import { loadOverall } from "../../src/application/overall"
import { loadOverview } from "../../src/application/overview"
import { loadTallies } from "../../src/application/tallies"
import { createAbsentSummaries } from "../../src/consolidation/absent/absent-summaries"
import { webCryptoJournalsDigest } from "../../src/consolidation/web-crypto/journals-digest"
import { createMemoryHistory } from "../../src/history/adapters/memory-history"
import { ME, fixtureBook, inProcessHledger, memoryStorage } from "../support/in-process"

const VIEWED = "viewed" as BookId
const WHOLE = "whole" as BookId

/** The fixture's plays filed over three years — its first play a year back, its second at the turn of the year — with its rates from before the first. */
const overYears = (files: BookFiles): BookFiles => {
  const moved = (files[BOOK_FILES.transactions] ?? "")
    .split("\n\n")
    .map((text, at) => (at === 0 ? text.replace("2026-09-05", "2024-06-01") : at === 1 ? text.replace("2026-09-12", "2025-12-31") : text))
  const prices = files[BOOK_FILES.prices] ?? ""
  const earlier = prices
    .split("\n")
    .filter((line) => line.startsWith("P 2026-09-01"))
    .map((line) => line.replace("P 2026-09-01", "P 2024-01-01"))
    .join("\n")
  return withEntriesFiled(
    { ...files, [BOOK_FILES.prices]: `${earlier}\n${prices}`, [BOOK_FILES.transactions]: "" },
    moved.map((text) => ({ date: text.slice(0, 10) as IsoDate, text: `${text.replace(/\n*$/, "")}\n` })),
  )
}

const setUp = async (): Promise<ConsolidationPorts & { readonly session: ReturnType<typeof createBookSession> }> => {
  const storage = memoryStorage()
  const fixture = await fixtureBook("basic-play", { id: VIEWED, members: [{ id: ME, displayName: "me", role: "owner" }] })
  const files = overYears(fixture.files)
  await storage.createBook({ ...fixture, files })
  await storage.createBook({ book: { ...fixture.book, id: WHOLE }, files: { ...files, [BOOK_FILES.transactions]: "; read whole: a line the app does not write\n" } })
  const session = createBookSession({
    hledger: await inProcessHledger(),
    storage,
    history: createMemoryHistory(() => crypto.randomUUID()),
    clock: () => new Date("2026-10-19T12:00:00+09:00"),
    newId: () => crypto.randomUUID(),
    member: ME,
  })
  return {
    ...consolidationPorts({
      session,
      lanes: oneLane(session),
      summaries: createAbsentSummaries(),
      digest: webCryptoJournalsDigest,
      today: () => "2026-10-19" as IsoDate,
      afterShown: (work) => work(),
      outdated: createOutdatedNotice(),
    }),
    answering: "when-checked",
  }
}

const PERIODS = ["date:2026-01-01..2027-01-01", "date:2026-09", "date:2025-12-31..2026-01-02", "date:2024", "date:..2026-01-01", ""] as const

/** The one book's answer, of each book asked. */
const readOf = <T>(answer: Outcome<readonly ConsolidatedBook<T>[]>): unknown => (answer.ok ? answer.value.map((each) => each.read) : answer)

describe("a book seen for a question about some days", () => {
  test("is the files the days can count, and none where nothing would be left out or a file holds what the app does not write", () => {
    const entry = (date: string) => ({ date: date as IsoDate, text: `${date} a\n    x  1\n    y\n` })
    const files = withEntriesFiled(
      { [BOOK_FILES.main]: "include accounts.journal\ninclude transactions.journal\n", [BOOK_FILES.accounts]: "", [BOOK_FILES.transactions]: "" },
      ["2024-06-01", "2026-01-01", "2026-09-05"].map(entry),
    )
    const year = viewOf(files, daysOfQuery("date:2026") ?? { from: undefined, until: undefined }, "moved")
    expect(Object.keys(year ?? {}).toSorted()).toEqual([BOOK_FILES.accounts, BOOK_FILES.main, BOOK_FILES.transactions, "transactions/2026.journal"])
    expect(year?.[BOOK_FILES.main]).not.toContain("transactions/2024.journal")
    expect(Object.keys(viewOf(files, daysOfQuery("date:..2026-01-01") ?? { from: undefined, until: undefined }, "stood") ?? {}).toSorted()).toEqual([
      BOOK_FILES.accounts,
      BOOK_FILES.main,
      BOOK_FILES.transactions,
      "transactions/2024.journal",
    ])
    expect(viewOf(files, daysOfQuery("date:2026-01-01..") ?? { from: undefined, until: undefined }, "stood")).toBeUndefined()
    expect(viewOf(files, { from: undefined, until: undefined }, "moved")).toBeUndefined()
    expect(viewOf({ ...files, [BOOK_FILES.transactions]: "; by hand\n" }, daysOfQuery("date:2026") ?? { from: undefined, until: undefined }, "moved")).toBeUndefined()
  })

  test("reads the days of a period the app writes, and none of any other query", () => {
    expect([daysOfQuery(""), daysOfQuery("date:2026-01-01..2027-01-01"), daysOfQuery("date:2026-12"), daysOfQuery("date:2026"), daysOfQuery("date:..2026-03-01"), daysOfQuery("tag:x")]).toEqual([
      { from: undefined, until: undefined },
      { from: "2026-01-01", until: "2027-01-01" },
      { from: "2026-12-01", until: "2027-01-01" },
      { from: "2026-01-01", until: "2027-01-01" },
      { from: undefined, until: "2026-03-01" },
      undefined,
    ] as never)
  })

  test("is answered as the whole book answers, by every question of the consolidation and over every period", async () => {
    const ports = await setUp()
    for (const period of PERIODS) {
      const asked = [
        (books: readonly BookId[]) => loadConsolidatedOverall(ports, books, period).then(readOf),
        (books: readonly BookId[]) => loadConsolidatedOtherGains(ports, books, period).then(readOf),
        (books: readonly BookId[]) => loadConsolidation(ports, books, "machine", period).then(readOf),
        (books: readonly BookId[]) => loadConsolidation(ports, books, "day", period).then(readOf),
        (books: readonly BookId[]) => loadConsolidatedDaysAndWhole(ports, books, period).then(readOf),
        (books: readonly BookId[]) => loadConsolidatedHoldings(ports, books, period).then(readOf),
        (books: readonly BookId[]) => loadConsolidatedSpinPerformances(ports, books, period),
      ]
      for (const ask of asked) {
        const [viewed, whole] = [await ask([VIEWED]), await ask([WHOLE])]
        expect([
          period,
          ((text) => (text.includes('"ok":false') ? text.slice(text.indexOf('"ok":false'), text.indexOf('"ok":false') + 200) : "answered"))(
            JSON.stringify(viewed, (_key, value: unknown) => (typeof value === "bigint" ? String(value) : value)),
          ),
        ]).toEqual([period, "answered"])
        expect([period, viewed]).toEqual([period, whole])
      }
    }
  })

  test("is answered as the whole book answers, by every question of one book's own screens and over every period", async () => {
    const { session } = await setUp()
    for (const period of PERIODS) {
      const asked = [
        (book: BookId) => loadOverall(session, book, period),
        (book: BookId) => loadOtherGains(session, book, period),
        (book: BookId) => loadOverview(session, book, period),
        (book: BookId) => loadBreakdown(session, book, "machine", period),
        (book: BookId) => loadBreakdown(session, book, "weekday", period),
        (book: BookId) => loadBreakdown(session, book, "parlor", period),
        (book: BookId) => loadDaysAndWhole(session, book, period, { chosen: undefined, offered: [] }),
        (book: BookId) => loadSpinPerformances(session, book, period),
        (book: BookId) => loadTallies(session, book, period, 0),
        (book: BookId) => loadHoldings(session, book, period),
        (book: BookId) => loadLastMoved(session, book, period),
      ]
      for (const ask of asked) {
        const [viewed, whole] = [await ask(VIEWED), await ask(WHOLE)]
        expect([period, String(ask).slice(0, 60), viewed.ok ? true : JSON.stringify(viewed).slice(0, 300)]).toEqual([period, String(ask).slice(0, 60), true])
        expect([period, viewed]).toEqual([period, whole])
      }
    }
  })
})
